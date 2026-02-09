/**
 * CloudWatch Monitoring and Alerting Utilities
 * Provides client-side monitoring and error reporting
 */

import { voisLabAnalytics } from './analytics';

// Monitoring configuration
const MONITORING_CONFIG = {
  errorReportingEnabled:
    import.meta.env.VITE_ERROR_REPORTING_ENABLED === 'true',
  performanceMonitoringEnabled:
    import.meta.env.VITE_PERFORMANCE_MONITORING_ENABLED === 'true',
  debugMode: import.meta.env.VITE_ENVIRONMENT === 'dev',
  sampleRate: parseFloat(import.meta.env.VITE_MONITORING_SAMPLE_RATE || '1.0'),
  maxErrorsPerSession: parseInt(
    import.meta.env.VITE_MAX_ERRORS_PER_SESSION || '10'
  ),
};

// Error types
export interface MonitoringError {
  type: 'javascript' | 'network' | 'audio' | 'aws' | 'user';
  message: string;
  stack?: string;
  url?: string;
  lineNumber?: number;
  columnNumber?: number;
  timestamp: number;
  userAgent: string;
  sessionId: string;
  userId?: string;
  context?: Record<string, any>;
}

// Performance metrics
export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent';
  timestamp: number;
  context?: Record<string, any>;
}

class MonitoringService {
  private sessionId: string;
  private errorCount: number = 0;
  private performanceObserver?: PerformanceObserver;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  /**
   * Initialize monitoring service
   */
  private initialize(): void {
    if (MONITORING_CONFIG.errorReportingEnabled) {
      this.setupErrorHandling();
    }

    if (MONITORING_CONFIG.performanceMonitoringEnabled) {
      this.setupPerformanceMonitoring();
    }

    if (MONITORING_CONFIG.debugMode) {
      console.log('🔍 Monitoring service initialized', {
        sessionId: this.sessionId,
        config: MONITORING_CONFIG,
      });
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Setup global error handling
   */
  private setupErrorHandling(): void {
    // JavaScript errors
    window.addEventListener('error', (event) => {
      this.reportError({
        type: 'javascript',
        message: event.message,
        stack: event.error?.stack,
        url: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        sessionId: this.sessionId,
      });
    });

    // Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        type: 'javascript',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        sessionId: this.sessionId,
      });
    });

    // Network errors (fetch wrapper)
    this.wrapFetch();
  }

  /**
   * Wrap fetch to monitor network errors
   */
  private wrapFetch(): void {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url =
        typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - startTime;

        // Track successful requests
        this.recordPerformanceMetric({
          name: 'network_request_duration',
          value: duration,
          unit: 'ms',
          timestamp: Date.now(),
          context: {
            url,
            status: response.status,
            method: args[1]?.method || 'GET',
          },
        });

        // Report errors for non-2xx responses
        if (!response.ok) {
          this.reportError({
            type: 'network',
            message: `HTTP ${response.status}: ${response.statusText}`,
            url,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            sessionId: this.sessionId,
            context: {
              status: response.status,
              statusText: response.statusText,
              method: args[1]?.method || 'GET',
            },
          });
        }

        return response;
      } catch (error) {
        const duration = performance.now() - startTime;

        this.reportError({
          type: 'network',
          message: `Network Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          stack: error instanceof Error ? error.stack : undefined,
          url,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          sessionId: this.sessionId,
          context: {
            duration,
            method: args[1]?.method || 'GET',
          },
        });

        throw error;
      }
    };
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    // Web Vitals and performance metrics
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.handlePerformanceEntry(entry);
        }
      });

      // Observe different types of performance entries
      try {
        this.performanceObserver.observe({
          entryTypes: ['navigation', 'resource', 'measure', 'paint'],
        });
      } catch (error) {
        console.warn('Performance Observer not fully supported:', error);
      }
    }

    // Monitor page load performance
    window.addEventListener('load', () => {
      setTimeout(() => {
        this.recordPageLoadMetrics();
      }, 0);
    });

    // Monitor memory usage (if available)
    if ('memory' in performance) {
      setInterval(() => {
        this.recordMemoryMetrics();
      }, 30000); // Every 30 seconds
    }
  }

  /**
   * Handle performance entries
   */
  private handlePerformanceEntry(entry: PerformanceEntry): void {
    switch (entry.entryType) {
      case 'navigation': {
        const navEntry = entry as PerformanceNavigationTiming;
        this.recordPerformanceMetric({
          name: 'page_load_time',
          value: navEntry.loadEventEnd - navEntry.fetchStart,
          unit: 'ms',
          timestamp: Date.now(),
          context: {
            domContentLoaded:
              navEntry.domContentLoadedEventEnd - navEntry.fetchStart,
            firstByte: navEntry.responseStart - navEntry.fetchStart,
          },
        });
        break;
      }

      case 'resource': {
        const resourceEntry = entry as PerformanceResourceTiming;
        if (
          resourceEntry.name.includes('.mp3') ||
          resourceEntry.name.includes('.wav')
        ) {
          this.recordPerformanceMetric({
            name: 'audio_resource_load_time',
            value: resourceEntry.duration,
            unit: 'ms',
            timestamp: Date.now(),
            context: {
              resource: resourceEntry.name,
              size: resourceEntry.transferSize,
            },
          });
        }
        break;
      }

      case 'paint':
        this.recordPerformanceMetric({
          name: entry.name.replace('-', '_'),
          value: entry.startTime,
          unit: 'ms',
          timestamp: Date.now(),
        });
        break;
    }
  }

  /**
   * Record page load metrics
   */
  private recordPageLoadMetrics(): void {
    const navigation = performance.getEntriesByType(
      'navigation'
    )[0] as PerformanceNavigationTiming;

    if (navigation) {
      const metrics = {
        dns_lookup: navigation.domainLookupEnd - navigation.domainLookupStart,
        tcp_connect: navigation.connectEnd - navigation.connectStart,
        request_response: navigation.responseEnd - navigation.requestStart,
        dom_processing:
          navigation.domContentLoadedEventEnd - navigation.responseEnd,
        resource_loading:
          navigation.loadEventEnd - navigation.domContentLoadedEventEnd,
      };

      Object.entries(metrics).forEach(([name, value]) => {
        this.recordPerformanceMetric({
          name,
          value,
          unit: 'ms',
          timestamp: Date.now(),
        });
      });
    }
  }

  /**
   * Record memory metrics
   */
  private recordMemoryMetrics(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;

      this.recordPerformanceMetric({
        name: 'memory_used',
        value: memory.usedJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
      });

      this.recordPerformanceMetric({
        name: 'memory_total',
        value: memory.totalJSHeapSize,
        unit: 'bytes',
        timestamp: Date.now(),
      });

      this.recordPerformanceMetric({
        name: 'memory_limit',
        value: memory.jsHeapSizeLimit,
        unit: 'bytes',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * NOTE: Health checks removed from client-side code.
   * Health monitoring should be done at the infrastructure level using:
   * - CloudWatch Alarms for CloudFront/S3/DynamoDB metrics
   * - Route53 Health Checks for active monitoring
   * - AWS CloudWatch Synthetics for synthetic monitoring
   * 
   * Client-side health checks waste resources and provide false signals.
   */

  /**
   * Report an error
   */
  reportError(error: MonitoringError): void {
    if (this.errorCount >= MONITORING_CONFIG.maxErrorsPerSession) {
      return; // Prevent spam
    }

    if (Math.random() > MONITORING_CONFIG.sampleRate) {
      return; // Sample rate limiting
    }

    this.errorCount++;

    // Send to analytics
    voisLabAnalytics.trackError(error.type, error.message, error.url);

    // Log to console in debug mode
    if (MONITORING_CONFIG.debugMode) {
      console.error('🔍 Monitoring Error:', error);
    }

    // In a real implementation, you would send this to CloudWatch or another monitoring service
    this.sendToMonitoringService('error', error);
  }

  /**
   * Record a performance metric
   */
  recordPerformanceMetric(metric: PerformanceMetric): void {
    if (Math.random() > MONITORING_CONFIG.sampleRate) {
      return; // Sample rate limiting
    }

    // Send to analytics
    voisLabAnalytics.trackPerformance({
      action: metric.name,
      category: 'performance',
      value: Math.round(metric.value),
      load_time: metric.unit === 'ms' ? metric.value : undefined,
      custom_parameters: metric.context,
    });

    // Log to console in debug mode
    if (MONITORING_CONFIG.debugMode) {
      console.log('🔍 Performance Metric:', metric);
    }

    // Send to monitoring service
    this.sendToMonitoringService('metric', metric);
  }



  /**
   * Send data to monitoring service (placeholder for CloudWatch integration)
   */
  private sendToMonitoringService(type: string, data: any): void {
    // In a real implementation, this would send data to CloudWatch Logs or Metrics
    // For now, we'll just store it locally for debugging

    const monitoringData = {
      type,
      data,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };

    // Store in localStorage for debugging (with size limit)
    try {
      const existingData = JSON.parse(
        localStorage.getItem('voislab-monitoring') || '[]'
      );
      existingData.push(monitoringData);

      // Keep only last 100 entries
      if (existingData.length > 100) {
        existingData.splice(0, existingData.length - 100);
      }

      localStorage.setItem('voislab-monitoring', JSON.stringify(existingData));
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    sessionId: string;
    errorCount: number;
    config: typeof MONITORING_CONFIG;
    isActive: boolean;
  } {
    return {
      sessionId: this.sessionId,
      errorCount: this.errorCount,
      config: MONITORING_CONFIG,
      isActive:
        MONITORING_CONFIG.errorReportingEnabled ||
        MONITORING_CONFIG.performanceMonitoringEnabled,
    };
  }

  /**
   * Get stored monitoring data (for debugging)
   */
  getStoredData(): any[] {
    try {
      return JSON.parse(localStorage.getItem('voislab-monitoring') || '[]');
    } catch {
      return [];
    }
  }

  /**
   * Clear stored monitoring data
   */
  clearStoredData(): void {
    localStorage.removeItem('voislab-monitoring');
  }

  /**
   * Cleanup monitoring service
   */
  cleanup(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();

// Make monitoring service available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).monitoringService = monitoringService;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  monitoringService.cleanup();
});
