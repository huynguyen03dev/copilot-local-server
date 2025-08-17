#!/usr/bin/env python3

"""
Real-time monitoring dashboard for GitHub Copilot API Server
Displays performance metrics, active streams, and system health
"""

import requests
import time
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

class MonitoringDashboard:
    def __init__(self, server_url: str = "http://localhost:8069"):
        self.server_url = server_url
        self.metrics_url = f"{server_url}/metrics"
        self.health_url = f"{server_url}/"
        self.last_metrics: Optional[Dict[str, Any]] = None
        
    def clear_screen(self):
        """Clear the terminal screen"""
        os.system('cls' if os.name == 'nt' else 'clear')
    
    def get_metrics(self) -> Optional[Dict[str, Any]]:
        """Fetch current metrics from the server"""
        try:
            response = requests.get(self.metrics_url, timeout=5)
            if response.status_code == 200:
                return response.json()
            else:
                return None
        except Exception as e:
            print(f"Error fetching metrics: {e}")
            return None
    
    def get_health(self) -> Optional[Dict[str, Any]]:
        """Check server health"""
        try:
            response = requests.get(self.health_url, timeout=5)
            if response.status_code == 200:
                return response.json()
            else:
                return None
        except Exception as e:
            return None
    
    def format_bytes(self, bytes_value: int) -> str:
        """Format bytes in human-readable format"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_value < 1024.0:
                return f"{bytes_value:.1f} {unit}"
            bytes_value /= 1024.0
        return f"{bytes_value:.1f} TB"
    
    def format_number(self, num: int) -> str:
        """Format large numbers with commas"""
        return f"{num:,}"
    
    def calculate_trends(self, current: Dict[str, Any]) -> Dict[str, str]:
        """Calculate trends compared to last metrics"""
        trends = {}
        
        if self.last_metrics:
            # Calculate stream trends
            current_streams = current['streams']['active']
            last_streams = self.last_metrics['streams']['active']
            
            if current_streams > last_streams:
                trends['streams'] = f"↗ +{current_streams - last_streams}"
            elif current_streams < last_streams:
                trends['streams'] = f"↘ -{last_streams - current_streams}"
            else:
                trends['streams'] = "→ stable"
            
            # Calculate request trends
            current_requests = current['streams']['total']
            last_requests = self.last_metrics['streams']['total']
            new_requests = current_requests - last_requests
            
            if new_requests > 0:
                trends['requests'] = f"↗ +{new_requests}"
            else:
                trends['requests'] = "→ stable"
        else:
            trends['streams'] = "→ initial"
            trends['requests'] = "→ initial"
        
        return trends
    
    def display_dashboard(self, metrics: Dict[str, Any], health: Optional[Dict[str, Any]]):
        """Display the monitoring dashboard"""
        self.clear_screen()
        
        # Header
        print("=" * 80)
        print("🚀 GITHUB COPILOT API SERVER - MONITORING DASHBOARD")
        print("=" * 80)
        print(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Server: {self.server_url}")
        print()
        
        # Server Health
        if health:
            print("🏥 SERVER HEALTH")
            print(f"   Status: ✅ {health.get('status', 'unknown').upper()}")
            print(f"   Service: {health.get('message', 'Unknown')}")
            print(f"   Version: {health.get('version', 'Unknown')}")
        else:
            print("🏥 SERVER HEALTH")
            print("   Status: ❌ UNREACHABLE")
        print()
        
        # Uptime
        uptime = metrics.get('uptime', {})
        print("⏰ UPTIME")
        print(f"   Duration: {uptime.get('human', 'Unknown')}")
        print(f"   Hours: {uptime.get('hours', 0):.1f}h")
        print()
        
        # Stream Statistics
        streams = metrics.get('streams', {})
        trends = self.calculate_trends(metrics)
        
        print("🔄 STREAMING STATISTICS")
        print(f"   Active Streams: {streams.get('active', 0)}/{streams.get('maxConcurrent', 0)} {trends.get('streams', '')}")
        print(f"   Peak Concurrent: {streams.get('peakConcurrent', 0)}")
        print(f"   Total Requests: {self.format_number(streams.get('total', 0))} {trends.get('requests', '')}")
        print(f"   Successful: {self.format_number(streams.get('successful', 0))}")
        print(f"   Failed: {self.format_number(streams.get('failed', 0))}")
        print(f"   Success Rate: {streams.get('successRate', 0)}%")
        print()
        
        # Performance Metrics
        performance = metrics.get('performance', {})
        print("⚡ PERFORMANCE METRICS")
        print(f"   Total Chunks: {self.format_number(performance.get('totalChunks', 0))}")
        print(f"   Total Data: {self.format_bytes(performance.get('totalBytes', 0))}")
        print(f"   Avg Stream Duration: {performance.get('averageStreamDuration', 0)}ms")
        print(f"   Chunks/sec: {performance.get('chunksPerSecond', 0)}")
        print(f"   Throughput: {self.format_bytes(performance.get('bytesPerSecond', 0))}/s")
        print()
        
        # Memory Usage
        memory = metrics.get('memory', {})
        print("🧠 MEMORY USAGE")
        print(f"   Heap Used: {self.format_bytes(memory.get('heapUsed', 0))}")
        print(f"   Heap Total: {self.format_bytes(memory.get('heapTotal', 0))}")
        print(f"   RSS: {self.format_bytes(memory.get('rss', 0))}")
        print(f"   External: {self.format_bytes(memory.get('external', 0))}")
        
        # Memory usage percentage
        if memory.get('heapTotal', 0) > 0:
            usage_percent = (memory.get('heapUsed', 0) / memory.get('heapTotal', 0)) * 100
            print(f"   Usage: {usage_percent:.1f}%")
        print()
        
        # Rate Limiting
        rate_limiting = metrics.get('rateLimiting', {})
        print("🚦 RATE LIMITING")
        print(f"   Active Clients: {rate_limiting.get('activeClients', 0)}")
        print(f"   Interval: {rate_limiting.get('intervalMs', 0)}ms")
        print()
        
        # Status Indicators
        print("📊 STATUS INDICATORS")
        
        # Stream capacity
        active = streams.get('active', 0)
        max_streams = streams.get('maxConcurrent', 1)
        capacity_percent = (active / max_streams) * 100
        
        if capacity_percent < 50:
            capacity_status = "🟢 LOW"
        elif capacity_percent < 80:
            capacity_status = "🟡 MEDIUM"
        else:
            capacity_status = "🔴 HIGH"
        
        print(f"   Stream Capacity: {capacity_status} ({capacity_percent:.1f}%)")
        
        # Success rate
        success_rate = streams.get('successRate', 100)
        if success_rate >= 95:
            success_status = "🟢 EXCELLENT"
        elif success_rate >= 90:
            success_status = "🟡 GOOD"
        else:
            success_status = "🔴 POOR"
        
        print(f"   Success Rate: {success_status} ({success_rate}%)")
        
        # Memory status
        heap_used_mb = memory.get('heapUsed', 0) / (1024 * 1024)
        if heap_used_mb < 500:
            memory_status = "🟢 NORMAL"
        elif heap_used_mb < 1000:
            memory_status = "🟡 ELEVATED"
        else:
            memory_status = "🔴 HIGH"
        
        print(f"   Memory Status: {memory_status} ({heap_used_mb:.0f}MB)")
        print()
        
        # Footer
        print("=" * 80)
        print("Press Ctrl+C to exit | Refreshing every 5 seconds")
        print("=" * 80)
    
    def run(self, refresh_interval: int = 5):
        """Run the monitoring dashboard"""
        print("🚀 Starting GitHub Copilot API Server Monitoring Dashboard...")
        print(f"📡 Connecting to: {self.server_url}")
        print("⏳ Loading initial metrics...")
        
        try:
            while True:
                metrics = self.get_metrics()
                health = self.get_health()
                
                if metrics:
                    self.display_dashboard(metrics, health)
                    self.last_metrics = metrics
                else:
                    self.clear_screen()
                    print("❌ Unable to fetch metrics from server")
                    print(f"🔗 Server URL: {self.server_url}")
                    print("🔄 Retrying in 5 seconds...")
                
                time.sleep(refresh_interval)
                
        except KeyboardInterrupt:
            print("\n\n👋 Monitoring dashboard stopped")
            sys.exit(0)
        except Exception as e:
            print(f"\n\n💥 Error: {e}")
            sys.exit(1)

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="GitHub Copilot API Server Monitoring Dashboard")
    parser.add_argument("--url", default="http://localhost:8069", help="Server URL (default: http://localhost:8069)")
    parser.add_argument("--interval", type=int, default=5, help="Refresh interval in seconds (default: 5)")
    
    args = parser.parse_args()
    
    dashboard = MonitoringDashboard(args.url)
    dashboard.run(args.interval)

if __name__ == "__main__":
    main()
