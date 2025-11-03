"""
Advanced audio processing module with format conversion and metadata extraction.
This module will be used when FFmpeg layer is available.
"""

import os
import tempfile
import subprocess
import json
from typing import Dict, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

class AdvancedAudioProcessor:
    """Advanced audio processing with FFmpeg integration"""
    
    def __init__(self):
        self.ffmpeg_path = '/opt/bin/ffmpeg'  # Path in Lambda layer
        self.ffprobe_path = '/opt/bin/ffprobe'  # Path in Lambda layer
    
    def is_ffmpeg_available(self) -> bool:
        """Check if FFmpeg is available in the environment"""
        return os.path.exists(self.ffmpeg_path) and os.path.exists(self.ffprobe_path)
    
    def extract_detailed_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract detailed metadata using FFprobe"""
        if not self.is_ffmpeg_available():
            logger.warning("FFmpeg not available, skipping detailed metadata extraction")
            return {}
        
        try:
            cmd = [
                self.ffprobe_path,
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                file_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                logger.error(f"FFprobe failed: {result.stderr}")
                return {}
            
            probe_data = json.loads(result.stdout)
            
            # Extract relevant metadata
            metadata = {}
            
            if 'format' in probe_data:
                format_info = probe_data['format']
                metadata.update({
                    'duration': float(format_info.get('duration', 0)),
                    'bitrate': int(format_info.get('bit_rate', 0)),
                    'size': int(format_info.get('size', 0))
                })
                
                # Extract tags if available
                if 'tags' in format_info:
                    tags = format_info['tags']
                    metadata.update({
                        'title': tags.get('title', ''),
                        'artist': tags.get('artist', ''),
                        'album': tags.get('album', ''),
                        'genre': tags.get('genre', ''),
                        'date': tags.get('date', ''),
                        'comment': tags.get('comment', '')
                    })
            
            # Extract stream information
            if 'streams' in probe_data:
                for stream in probe_data['streams']:
                    if stream.get('codec_type') == 'audio':
                        metadata.update({
                            'codec': stream.get('codec_name', ''),
                            'sampleRate': int(stream.get('sample_rate', 0)),
                            'channels': int(stream.get('channels', 0)),
                            'channelLayout': stream.get('channel_layout', '')
                        })
                        break
            
            return metadata
            
        except subprocess.TimeoutExpired:
            logger.error("FFprobe timeout")
            return {}
        except Exception as e:
            logger.error(f"Error extracting metadata: {str(e)}")
            return {}
    
    def convert_to_mp3(self, input_path: str, output_path: str, quality: str = 'high') -> bool:
        """Convert audio file to MP3 format"""
        if not self.is_ffmpeg_available():
            logger.warning("FFmpeg not available, skipping conversion")
            return False
        
        try:
            # Quality settings
            quality_settings = {
                'high': ['-b:a', '320k'],
                'medium': ['-b:a', '192k'],
                'low': ['-b:a', '128k']
            }
            
            bitrate_args = quality_settings.get(quality, quality_settings['medium'])
            
            cmd = [
                self.ffmpeg_path,
                '-i', input_path,
                '-codec:a', 'libmp3lame',
                *bitrate_args,
                '-ar', '44100',  # Sample rate
                '-ac', '2',      # Stereo
                '-y',            # Overwrite output file
                output_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg conversion failed: {result.stderr}")
                return False
            
            return os.path.exists(output_path)
            
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg conversion timeout")
            return False
        except Exception as e:
            logger.error(f"Error converting to MP3: {str(e)}")
            return False
    
    def optimize_audio(self, input_path: str, output_path: str, target_format: str = 'mp3') -> bool:
        """Optimize audio file for web streaming"""
        if not self.is_ffmpeg_available():
            logger.warning("FFmpeg not available, skipping optimization")
            return False
        
        try:
            if target_format.lower() == 'mp3':
                # Optimize for web streaming
                cmd = [
                    self.ffmpeg_path,
                    '-i', input_path,
                    '-codec:a', 'libmp3lame',
                    '-b:a', '192k',
                    '-ar', '44100',
                    '-ac', '2',
                    '-map_metadata', '0',  # Preserve metadata
                    '-id3v2_version', '3',  # Use ID3v2.3 for better compatibility
                    '-write_id3v1', '1',    # Also write ID3v1 for compatibility
                    '-y',
                    output_path
                ]
            else:
                # For other formats, just copy with optimization
                cmd = [
                    self.ffmpeg_path,
                    '-i', input_path,
                    '-c', 'copy',
                    '-y',
                    output_path
                ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0:
                logger.error(f"Audio optimization failed: {result.stderr}")
                return False
            
            return os.path.exists(output_path)
            
        except subprocess.TimeoutExpired:
            logger.error("Audio optimization timeout")
            return False
        except Exception as e:
            logger.error(f"Error optimizing audio: {str(e)}")
            return False
    
    def generate_waveform_data(self, input_path: str) -> Optional[Dict[str, Any]]:
        """Generate waveform data for visualization"""
        if not self.is_ffmpeg_available():
            logger.warning("FFmpeg not available, skipping waveform generation")
            return None
        
        try:
            # Generate waveform data as JSON
            with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as temp_file:
                temp_path = temp_file.name
            
            cmd = [
                self.ffmpeg_path,
                '-i', input_path,
                '-filter_complex', 'showwavespic=s=1200x200:colors=0x3b82f6',
                '-frames:v', '1',
                '-f', 'image2',
                '-y',
                temp_path.replace('.json', '.png')
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                # For now, just return basic waveform info
                # In a full implementation, you'd process the generated image
                return {
                    'generated': True,
                    'width': 1200,
                    'height': 200,
                    'format': 'png'
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error generating waveform: {str(e)}")
            return None
        finally:
            # Clean up temp files
            try:
                if 'temp_path' in locals():
                    for ext in ['.json', '.png']:
                        temp_file_path = temp_path.replace('.json', ext)
                        if os.path.exists(temp_file_path):
                            os.unlink(temp_file_path)
            except:
                pass
    
    def validate_audio_integrity(self, file_path: str) -> Tuple[bool, str]:
        """Validate audio file integrity using FFmpeg"""
        if not self.is_ffmpeg_available():
            return True, "FFmpeg not available for validation"
        
        try:
            cmd = [
                self.ffmpeg_path,
                '-v', 'error',
                '-i', file_path,
                '-f', 'null',
                '-'
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                return True, "Audio file is valid"
            else:
                return False, f"Audio validation failed: {result.stderr}"
                
        except subprocess.TimeoutExpired:
            return False, "Audio validation timeout"
        except Exception as e:
            return False, f"Error validating audio: {str(e)}"

def process_with_advanced_features(file_path: str, output_dir: str) -> Dict[str, Any]:
    """Process audio file with advanced features if available"""
    processor = AdvancedAudioProcessor()
    results = {}
    
    # Extract detailed metadata
    metadata = processor.extract_detailed_metadata(file_path)
    if metadata:
        results['metadata'] = metadata
    
    # Validate audio integrity
    is_valid, validation_message = processor.validate_audio_integrity(file_path)
    results['validation'] = {
        'isValid': is_valid,
        'message': validation_message
    }
    
    if not is_valid:
        return results
    
    # Convert to optimized MP3 if not already MP3
    filename = os.path.basename(file_path)
    name, ext = os.path.splitext(filename)
    
    if ext.lower() != '.mp3':
        mp3_path = os.path.join(output_dir, f"{name}_optimized.mp3")
        if processor.convert_to_mp3(file_path, mp3_path):
            results['converted'] = {
                'format': 'mp3',
                'path': mp3_path,
                'optimized': True
            }
    else:
        # Optimize existing MP3
        optimized_path = os.path.join(output_dir, f"{name}_optimized.mp3")
        if processor.optimize_audio(file_path, optimized_path):
            results['optimized'] = {
                'path': optimized_path,
                'format': 'mp3'
            }
    
    # Generate waveform data
    waveform_data = processor.generate_waveform_data(file_path)
    if waveform_data:
        results['waveform'] = waveform_data
    
    return results