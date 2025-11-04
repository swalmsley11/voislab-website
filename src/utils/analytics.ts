/**
 * Analytics and Monitoring Utilities
 * Provides Google Analytics integration and custom event tracking
 */

// Google Analytics configuration
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT || 'dev';

// Analytics event types
export interface AnalyticsEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
  custom_parameters?: Record<string, any>;
}

// Audio-specific events
export interface AudioEvent extends AnalyticsEvent {
  track_id?: string;
  track_title?: string;
  track_duration?: number;
  track_genre?: string;
  playback_position?: number;
  audio_quality?: string;
}

// User interaction events
export interface UserInteractionEvent extends AnalyticsEvent {
  element_type?: string;
  page_location?: string;
  search_query?: string;
  filter_type?: string;
}

// Performance events
export interface PerformanceEvent extends AnalyticsEvent {
  load_time?: number;
  resource_type?: string;
  error_type?: string;
  error_message?: string;
}

class AnalyticsService {
  private isInitialized: boolean = false;
  private isEnabled: boolean = false;
  private debugMode: boolean = false;

  constructor() {
    this.debugMode = ENVIRONMENT === 'dev' || localStorage.getItem('voislab-analytics-debug') === 'true';
    this.initialize();
  }

  /**
   * Initialize Google Analytics
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Only enable analytics in production or when explicitly enabled
    this.isEnabled = ENVIRONMENT === 'prod' || localStorage.getItem('voislab-analytics-enabled') === 'true';

    if (!this.isEnabled) {
      if (this.debugMode) {
        console.log('📊 Analytics disabled in development mode');
      }
      this.isInitialized = true;
      return;
    }

    if (!GA_MEASUREMENT_ID) {
      console.warn('Google Analytics Measurement ID not configured');
      this.isInitialized = true;
      return;
    }

    try {
      // Load Google Analytics script
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(script);

      // Initialize gtag
      (window as any).dataLayer = (window as any).dataLayer || [];
      const gtag = (...args: any[]) => {
        (window as any).dataLayer.push(args);
      };

      (window as any).gtag = gtag;

      gtag('js', new Date());
      gtag('config', GA_MEASUREMENT_ID, {
        debug_mode: this.debugMode,
        send_page_view: true,
        anonymize_ip: true, // GDPR compliance
        allow_google_signals: false, // Privacy-focused
        cookie_flags: 'SameSite=Strict;Secure', // Enhanced security
      });

      if (this.debugMode) {
        console.log('📊 Google Analytics initialized:', GA_MEASUREMENT_ID);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Google Analytics:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Track a generic event
   */
  trackEvent(event: AnalyticsEvent): void {
    if (!this.isEnabled) {
      if (this.debugMode) {
        console.log('📊 Analytics Event (Debug):', event);
      }
      return;
    }

    if (!this.isInitialized) {
      console.warn('Analytics not initialized');
      return;
    }

    try {
      const gtag = (window as any).gtag;
      if (gtag) {
        gtag('event', event.action, {
          event_category: event.category,
          event_label: event.label,
          value: event.value,
          ...event.custom_parameters,
        });

        if (this.debugMode) {
          console.log('📊 Analytics Event Sent:', event);
        }
      }
    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  }

  /**
   * Track audio-related events
   */
  trackAudioEvent(event: AudioEvent): void {
    const audioEvent: AnalyticsEvent = {
      ...event,
      custom_parameters: {
        track_id: event.track_id,
        track_title: event.track_title,
        track_duration: event.track_duration,
        track_genre: event.track_genre,
        playback_position: event.playback_position,
        audio_quality: event.audio_quality,
        ...event.custom_parameters,
      },
    };

    this.trackEvent(audioEvent);
  }

  /**
   * Track user interaction events
   */
  trackUserInteraction(event: UserInteractionEvent): void {
    const interactionEvent: AnalyticsEvent = {
      ...event,
      custom_parameters: {
        element_type: event.element_type,
        page_location: event.page_location || window.location.pathname,
        search_query: event.search_query,
        filter_type: event.filter_type,
        ...event.custom_parameters,
      },
    };

    this.trackEvent(interactionEvent);
  }

  /**
   * Track performance events
   */
  trackPerformance(event: PerformanceEvent): void {
    const performanceEvent: AnalyticsEvent = {
      ...event,
      custom_parameters: {
        load_time: event.load_time,
        resource_type: event.resource_type,
        error_type: event.error_type,
        error_message: event.error_message,
        user_agent: navigator.userAgent,
        connection_type: (navigator as any).connection?.effectiveType,
        ...event.custom_parameters,
      },
    };

    this.trackEvent(performanceEvent);
  }

  /**
   * Track page views
   */
  trackPageView(page_title?: string, page_location?: string): void {
    if (!this.isEnabled || !this.isInitialized) return;

    try {
      const gtag = (window as any).gtag;
      if (gtag) {
        gtag('config', GA_MEASUREMENT_ID, {
          page_title: page_title || document.title,
          page_location: page_location || window.location.href,
        });

        if (this.debugMode) {
          console.log('📊 Page View Tracked:', {
            page_title: page_title || document.title,
            page_location: page_location || window.location.href,
          });
        }
      }
    } catch (error) {
      console.error('Failed to track page view:', error);
    }
  }

  /**
   * Track custom conversions/goals
   */
  trackConversion(conversion_name: string, conversion_value?: number): void {
    this.trackEvent({
      action: 'conversion',
      category: 'engagement',
      label: conversion_name,
      value: conversion_value,
      custom_parameters: {
        conversion_name,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>): void {
    if (!this.isEnabled || !this.isInitialized) return;

    try {
      const gtag = (window as any).gtag;
      if (gtag) {
        gtag('config', GA_MEASUREMENT_ID, {
          user_properties: properties,
        });

        if (this.debugMode) {
          console.log('📊 User Properties Set:', properties);
        }
      }
    } catch (error) {
      console.error('Failed to set user properties:', error);
    }
  }

  /**
   * Enable or disable analytics
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    localStorage.setItem('voislab-analytics-enabled', enabled.toString());

    if (this.debugMode) {
      console.log(`📊 Analytics ${enabled ? 'enabled' : 'disabled'}`);
    }
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(debug: boolean): void {
    this.debugMode = debug;
    localStorage.setItem('voislab-analytics-debug', debug.toString());

    if (debug) {
      console.log('📊 Analytics debug mode enabled');
    }
  }

  /**
   * Get analytics status
   */
  getStatus(): {
    isInitialized: boolean;
    isEnabled: boolean;
    debugMode: boolean;
    measurementId: string | undefined;
  } {
    return {
      isInitialized: this.isInitialized,
      isEnabled: this.isEnabled,
      debugMode: this.debugMode,
      measurementId: GA_MEASUREMENT_ID,
    };
  }
}

// Predefined event tracking functions for common VoisLab actions
export class VoisLabAnalytics {
  private analytics: AnalyticsService;

  constructor() {
    this.analytics = new AnalyticsService();
  }

  // Audio playback events
  trackAudioPlay(trackId: string, trackTitle: string, trackGenre?: string): void {
    this.analytics.trackAudioEvent({
      action: 'play',
      category: 'audio',
      label: trackTitle,
      track_id: trackId,
      track_title: trackTitle,
      track_genre: trackGenre,
    });
  }

  trackAudioPause(trackId: string, playbackPosition: number): void {
    this.analytics.trackAudioEvent({
      action: 'pause',
      category: 'audio',
      track_id: trackId,
      playback_position: playbackPosition,
    });
  }

  trackAudioComplete(trackId: string, trackDuration: number): void {
    this.analytics.trackAudioEvent({
      action: 'complete',
      category: 'audio',
      track_id: trackId,
      track_duration: trackDuration,
    });

    // Track as conversion
    this.analytics.trackConversion('audio_complete', 1);
  }

  trackAudioError(trackId: string, errorMessage: string): void {
    this.analytics.trackPerformance({
      action: 'audio_error',
      category: 'error',
      error_type: 'audio_playback',
      error_message: errorMessage,
      custom_parameters: { track_id: trackId },
    });
  }

  // User interaction events
  trackSearch(query: string, resultsCount: number): void {
    this.analytics.trackUserInteraction({
      action: 'search',
      category: 'engagement',
      label: query,
      value: resultsCount,
      search_query: query,
    });
  }

  trackFilter(filterType: string, filterValue: string): void {
    this.analytics.trackUserInteraction({
      action: 'filter',
      category: 'engagement',
      label: `${filterType}:${filterValue}`,
      filter_type: filterType,
    });
  }

  trackStreamingLinkClick(platform: string, trackId: string): void {
    this.analytics.trackUserInteraction({
      action: 'streaming_link_click',
      category: 'engagement',
      label: platform,
      custom_parameters: {
        platform,
        track_id: trackId,
      },
    });

    // Track as conversion
    this.analytics.trackConversion('streaming_link_click', 1);
  }

  trackSocialShare(platform: string, content: string): void {
    this.analytics.trackUserInteraction({
      action: 'social_share',
      category: 'engagement',
      label: platform,
      custom_parameters: {
        platform,
        content,
      },
    });

    // Track as conversion
    this.analytics.trackConversion('social_share', 1);
  }

  // Performance tracking
  trackPageLoadTime(loadTime: number): void {
    this.analytics.trackPerformance({
      action: 'page_load',
      category: 'performance',
      value: Math.round(loadTime),
      load_time: loadTime,
    });
  }

  trackAudioLoadTime(trackId: string, loadTime: number): void {
    this.analytics.trackPerformance({
      action: 'audio_load',
      category: 'performance',
      value: Math.round(loadTime),
      load_time: loadTime,
      custom_parameters: { track_id: trackId },
    });
  }

  trackError(errorType: string, errorMessage: string, context?: string): void {
    this.analytics.trackPerformance({
      action: 'error',
      category: 'error',
      label: errorType,
      error_type: errorType,
      error_message: errorMessage,
      custom_parameters: { context },
    });
  }

  // Expose trackPerformance method
  trackPerformance(event: PerformanceEvent): void {
    this.analytics.trackPerformance(event);
  }

  // Utility methods
  trackPageView(pageTitle?: string): void {
    this.analytics.trackPageView(pageTitle);
  }

  setUserProperties(properties: Record<string, any>): void {
    this.analytics.setUserProperties(properties);
  }

  getStatus() {
    return this.analytics.getStatus();
  }

  setEnabled(enabled: boolean): void {
    this.analytics.setEnabled(enabled);
  }

  setDebugMode(debug: boolean): void {
    this.analytics.setDebugMode(debug);
  }
}

// Export singleton instance
export const voisLabAnalytics = new VoisLabAnalytics();

// Make analytics available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).voisLabAnalytics = voisLabAnalytics;
}