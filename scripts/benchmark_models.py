#!/usr/bin/env python3
"""
Benchmark script for comparing different AI models on NVIDIA API.
Tests: token generation speed and tool calling capability.
"""

from openai import OpenAI
import time
import json
import sys
from typing import Dict, List

# NVIDIA API setup
client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="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"
)

# Models to test
MODELS = [
    "openai/gpt-oss-120b",
    "moonshotai/kimi-k2.5",
    "z-ai/glm5",
    "nvidia/nemotron-3-super-120b-a12b",
    "moonshotai/kimi-k2-instruct",
    "deepseek-ai/deepseek-v3.2",
    "meta/llama-3.3-70b-instruct",
    "qwen/qwen3.5-397b-a17b",
    "z-ai/glm4.7",
]

# Test prompts
SIMPLE_PROMPT = "Explain what is photosynthesis in 2 sentences."
TOOL_CALLING_PROMPT = "I want to practice biology questions about cell structure. Create a multiple-choice exercise for me."

# Tool definition for testing
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "presentExercise",
            "description": "Present an interactive exercise to the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "exerciseMarkdown": {
                        "type": "string",
                        "description": "Exercise in markdown format with type, text, choices, correct answer"
                    }
                },
                "required": ["exerciseMarkdown"]
            }
        }
    }
]


def test_speed(model: str, prompt: str) -> Dict:
    """Test token generation speed."""
    print(f"\n  Testing speed for {model}...")
    
    try:
        start_time = time.time()
        token_count = 0
        first_token_time = None
        
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=200,
            stream=True,
            timeout=30,
        )
        
        for chunk in completion:
            if not first_token_time:
                first_token_time = time.time()
            
            if hasattr(chunk, "choices") and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if hasattr(delta, "content") and delta.content:
                    token_count += len(delta.content.split())
        
        end_time = time.time()
        total_time = end_time - start_time
        time_to_first = first_token_time - start_time if first_token_time else 0
        tokens_per_sec = token_count / total_time if total_time > 0 else 0
        
        return {
            "success": True,
            "tokens": token_count,
            "total_time": round(total_time, 2),
            "time_to_first": round(time_to_first, 2),
            "tokens_per_sec": round(tokens_per_sec, 1),
            "error": None
        }
    
    except Exception as e:
        return {
            "success": False,
            "tokens": 0,
            "total_time": 0,
            "time_to_first": 0,
            "tokens_per_sec": 0,
            "error": str(e)[:50]
        }


def test_tool_calling(model: str) -> Dict:
    """Test tool calling capability."""
    print(f"  Testing tool calling for {model}...")
    
    try:
        start_time = time.time()
        
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": TOOL_CALLING_PROMPT}],
            tools=TOOLS,
            temperature=0.7,
            max_tokens=500,
            timeout=30,
        )
        
        end_time = time.time()
        
        # Check if model called the tool
        tool_called = False
        if hasattr(completion, "choices") and len(completion.choices) > 0:
            message = completion.choices[0].message
            if hasattr(message, "tool_calls") and message.tool_calls:
                tool_called = True
        
        return {
            "success": True,
            "tool_called": tool_called,
            "time": round(end_time - start_time, 2),
            "error": None
        }
    
    except Exception as e:
        return {
            "success": False,
            "tool_called": False,
            "time": 0,
            "error": str(e)[:50]
        }


def print_results(results: List[Dict]):
    """Print results in a formatted table."""
    print("\n" + "="*100)
    print("BENCHMARK RESULTS")
    print("="*100)
    print(f"{'Model':<40} {'Speed':<15} {'TTFT':<8} {'Tok/s':<8} {'Tool✓':<8} {'Status':<10}")
    print("-"*100)
    
    for result in results:
        model_name = result["model"].split("/")[-1][:38]
        speed = result["speed"]
        tool = result["tool"]
        
        if speed["success"]:
            speed_str = f"{speed['total_time']}s"
            ttft_str = f"{speed['time_to_first']}s"
            tps_str = f"{speed['tokens_per_sec']}"
        else:
            speed_str = "FAIL"
            ttft_str = "-"
            tps_str = "-"
        
        if tool["success"]:
            tool_str = "✓" if tool["tool_called"] else "✗"
            status = "OK" if tool["tool_called"] else "NO TOOL"
        else:
            tool_str = "ERR"
            status = "FAILED"
        
        print(f"{model_name:<40} {speed_str:<15} {ttft_str:<8} {tps_str:<8} {tool_str:<8} {status:<10}")
    
    print("="*100)
    print("\nLegend:")
    print("  Speed: Total generation time")
    print("  TTFT: Time To First Token")
    print("  Tok/s: Tokens per second")
    print("  Tool✓: Whether model successfully called presentExercise tool")


def main():
    print("Starting model benchmark...")
    print(f"Testing {len(MODELS)} models")
    
    results = []
    
    for i, model in enumerate(MODELS, 1):
        print(f"\n[{i}/{len(MODELS)}] Testing: {model}")
        
        # Test speed
        speed_result = test_speed(model, SIMPLE_PROMPT)
        
        # Test tool calling
        tool_result = test_tool_calling(model)
        
        results.append({
            "model": model,
            "speed": speed_result,
            "tool": tool_result
        })
        
        # Small delay between tests
        time.sleep(1)
    
    # Print summary
    print_results(results)
    
    # Find best models
    print("\n🏆 RECOMMENDATIONS:")
    
    # Best speed
    successful_speed = [r for r in results if r["speed"]["success"]]
    if successful_speed:
        best_speed = max(successful_speed, key=lambda x: x["speed"]["tokens_per_sec"])
        print(f"  Fastest: {best_speed['model']} ({best_speed['speed']['tokens_per_sec']} tok/s)")
    
    # Best tool calling
    tool_callers = [r for r in results if r["tool"]["success"] and r["tool"]["tool_called"]]
    if tool_callers:
        best_tool = min(tool_callers, key=lambda x: x["tool"]["time"])
        print(f"  Best Tool Calling: {best_tool['model']} ({best_tool['tool']['time']}s)")
    
    # Overall best (both fast and supports tools)
    both_good = [r for r in results 
                 if r["speed"]["success"] and r["tool"]["success"] and r["tool"]["tool_called"]]
    if both_good:
        best_overall = max(both_good, key=lambda x: x["speed"]["tokens_per_sec"])
        print(f"  Best Overall: {best_overall['model']}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nBenchmark interrupted by user")
        sys.exit(1)
