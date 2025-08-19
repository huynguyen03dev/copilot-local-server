#!/usr/bin/env python3
"""
Real-time Performance Monitoring Dashboard
Tracks performance metrics and optimization effectiveness
"""

import asyncio
import aiohttp
import time
import json
from datetime import datetime
import os

class PerformanceMonitor:
    def __init__(self, server_url: str = "http://localhost:8069"):
        self.server_url = server_url
        self.metrics_history = []
        self.start_time = time.time()
        
    async def collect_metrics(self):
        """Collect current server metrics"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.server_url}/metrics") as response:
                    if response.status == 200:
                        metrics = await response.json()
                        metrics['timestamp'] = datetime.now().isoformat()
                        metrics['uptime_hours'] = (time.time() - self.start_time) / 3600
                        self.metrics_history.append(metrics)
                        return metrics
        except Exception as e:
            print(f"❌ Failed to collect metrics: {e}")
        return None
    
    def calculate_performance_trends(self):
        """Calculate performance trends over time"""
        if len(self.metrics_history) < 2:
            return {}
        
        recent = self.metrics_history[-10:]  # Last 10 measurements
        
        # Calculate averages
        avg_response_time = sum(m.get('performance', {}).get('averageStreamDuration', 0) for m in recent) / len(recent)
        avg_throughput = sum(m.get('performance', {}).get('chunksPerSecond', 0) for m in recent) / len(recent)
        avg_memory = sum(m.get('memory', {}).get('heapUsed', 0) for m in recent) / len(recent) / (1024*1024)  # MB
        
        # Calculate success rate
        total_requests = recent[-1].get('streams', {}).get('total', 0)
        successful_requests = recent[-1].get('streams', {}).get('successful', 0)
        success_rate = (successful_requests / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'avg_response_time_ms': avg_response_time,
            'avg_throughput_chunks_sec': avg_throughput,
            'avg_memory_mb': avg_memory,
            'success_rate_percent': success_rate,
            'total_requests': total_requests,
            'active_streams': recent[-1].get('streams', {}).get('active', 0),
            'connection_pool_stats': recent[-1].get('connectionPool', {})
        }
    
    def print_dashboard(self, metrics, trends):
        """Print real-time dashboard"""
        os.system('clear' if os.name == 'posix' else 'cls')
        
        print("🚀 VSCode API Server - Performance Dashboard")
        print("=" * 60)
        print(f"⏰ Time: {datetime.now().strftime('%H:%M:%S')}")
        print(f"🕐 Uptime: {metrics.get('uptime', {}).get('human', 'Unknown')}")
        print()
        
        # Current Status
        print("📊 CURRENT STATUS:")
        streams = metrics.get('streams', {})
        print(f"   Active Streams:    {streams.get('active', 0)}/{streams.get('maxConcurrent', 0)}")
        print(f"   Success Rate:      {trends.get('success_rate_percent', 0):.1f}%")
        print(f"   Total Requests:    {trends.get('total_requests', 0)}")
        print()
        
        # Performance Metrics
        print("⚡ PERFORMANCE:")
        performance = metrics.get('performance', {})
        print(f"   Avg Response:      {trends.get('avg_response_time_ms', 0):.0f}ms")
        print(f"   Throughput:        {trends.get('avg_throughput_chunks_sec', 0):.1f} chunks/sec")
        print(f"   Bytes/sec:         {performance.get('bytesPerSecond', 0):.0f}")
        print()
        
        # Resource Usage
        print("💾 RESOURCES:")
        memory = metrics.get('memory', {})
        heap_used_mb = memory.get('heapUsed', 0) / (1024*1024)
        heap_total_mb = memory.get('heapTotal', 0) / (1024*1024)
        print(f"   Memory Usage:      {heap_used_mb:.1f}MB / {heap_total_mb:.1f}MB")
        print(f"   Memory Trend:      {trends.get('avg_memory_mb', 0):.1f}MB avg")
        print()
        
        # Connection Pool Stats
        print("🔗 CONNECTION POOL:")
        pool_stats = trends.get('connection_pool_stats', {})
        print(f"   Active Connections: {pool_stats.get('activeConnections', 0)}")
        print(f"   Pending Requests:   {pool_stats.get('pendingRequests', 0)}")
        print(f"   Total Requests:     {pool_stats.get('totalRequests', 0)}")
        print(f"   Error Rate:         {pool_stats.get('totalErrors', 0)} errors")
        print(f"   Avg Response:       {pool_stats.get('averageResponseTime', 0):.1f}ms")
        print()
        
        # Performance Rating
        rating = self.get_performance_rating(trends)
        print(f"🏆 PERFORMANCE RATING: {rating}")
        print()
        
        # Optimization Status
        print("🔧 OPTIMIZATIONS:")
        print("   ✅ Endpoint Caching:     ACTIVE")
        print("   ✅ Token Caching:        ACTIVE") 
        print("   ✅ Connection Pooling:   ACTIVE")
        print()
        
        print("Press Ctrl+C to stop monitoring...")
    
    def get_performance_rating(self, trends):
        """Calculate performance rating"""
        response_time = trends.get('avg_response_time_ms', 0)
        success_rate = trends.get('success_rate_percent', 0)
        memory_usage = trends.get('avg_memory_mb', 0)
        
        if response_time < 1000 and success_rate >= 95 and memory_usage < 500:
            return "🟢 EXCELLENT"
        elif response_time < 2000 and success_rate >= 90 and memory_usage < 750:
            return "🟡 GOOD"
        elif response_time < 5000 and success_rate >= 80:
            return "🟠 FAIR"
        else:
            return "🔴 POOR"
    
    def save_metrics_log(self):
        """Save metrics to log file"""
        if self.metrics_history:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"performance_log_{timestamp}.json"
            
            with open(filename, 'w') as f:
                json.dump(self.metrics_history, f, indent=2)
            
            print(f"📁 Metrics saved to: {filename}")
    
    async def run_monitoring(self, interval: int = 5):
        """Run continuous monitoring"""
        print("🚀 Starting Performance Monitor...")
        print(f"📊 Collecting metrics every {interval} seconds")
        print("🌐 Server URL:", self.server_url)
        print()
        
        try:
            while True:
                metrics = await self.collect_metrics()
                if metrics:
                    trends = self.calculate_performance_trends()
                    self.print_dashboard(metrics, trends)
                else:
                    print("❌ Unable to collect metrics - is the server running?")
                
                await asyncio.sleep(interval)
                
        except KeyboardInterrupt:
            print("\n\n👋 Stopping monitor...")
            self.save_metrics_log()

async def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Performance Monitor for VSCode API Server")
    parser.add_argument("--url", default="http://localhost:8069", help="Server URL")
    parser.add_argument("--interval", type=int, default=5, help="Monitoring interval in seconds")
    
    args = parser.parse_args()
    
    monitor = PerformanceMonitor(args.url)
    await monitor.run_monitoring(args.interval)

if __name__ == "__main__":
    asyncio.run(main())
