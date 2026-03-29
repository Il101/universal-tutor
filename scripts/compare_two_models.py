#!/usr/bin/env python3
"""
Detailed comparison between two models: GPT-OSS 120B vs GLM5
"""

from openai import OpenAI
import time
import json

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="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"
)

MODEL_1 = "openai/gpt-oss-120b"
MODEL_2 = "z-ai/glm5"

# Test scenarios
TESTS = [
    {
        "name": "Simple factual question",
        "prompt": "What is photosynthesis? Answer in 2 sentences."
    },
    {
        "name": "Educational content generation",
        "prompt": "Create a short lesson about cell biology, suitable for high school students."
    },
    {
        "name": "Tool calling (presentExercise)",
        "prompt": "Create a multiple-choice biology question about mitochondria.",
        "use_tools": True
    },
    {
        "name": "Complex reasoning",
        "prompt": "Explain the difference between DNA and RNA, and why this matters for gene expression."
    },
    {
        "name": "Russian language",
        "prompt": "Объясни что такое фотосинтез простыми словами."
    }
]

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
                        "description": "Exercise in markdown format"
                    }
                },
                "required": ["exerciseMarkdown"]
            }
        }
    }
]


def test_model(model: str, test: dict):
    """Run a single test on a model."""
    print(f"    Testing: {test['name']}")
    
    try:
        start_time = time.time()
        first_token_time = None
        tokens = []
        tool_called = False
        
        params = {
            "model": model,
            "messages": [{"role": "user", "content": test["prompt"]}],
            "temperature": 0.7,
            "max_tokens": 500,
            "stream": True,
            "timeout": 30,
        }
        
        if test.get("use_tools"):
            params["tools"] = TOOLS
            params["stream"] = False  # Tools don't work with streaming
            
            response = client.chat.completions.create(**params)
            end_time = time.time()
            
            # Check tool calling
            if hasattr(response, "choices") and len(response.choices) > 0:
                message = response.choices[0].message
                if hasattr(message, "tool_calls") and message.tool_calls:
                    tool_called = True
                    content = f"Tool called: {message.tool_calls[0].function.name}"
                else:
                    content = message.content[:100] if message.content else ""
            
            return {
                "success": True,
                "time": round(end_time - start_time, 2),
                "ttft": None,
                "tokens": len(content.split()) if content else 0,
                "tool_called": tool_called,
                "preview": content[:80] if content else "",
                "error": None
            }
        else:
            completion = client.chat.completions.create(**params)
            
            for chunk in completion:
                if not first_token_time:
                    first_token_time = time.time()
                
                if hasattr(chunk, "choices") and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, "content") and delta.content:
                        tokens.append(delta.content)
            
            end_time = time.time()
            full_response = "".join(tokens)
            
            return {
                "success": True,
                "time": round(end_time - start_time, 2),
                "ttft": round(first_token_time - start_time, 2) if first_token_time else 0,
                "tokens": len(full_response.split()),
                "tool_called": None,
                "preview": full_response[:80],
                "error": None
            }
    
    except Exception as e:
        return {
            "success": False,
            "time": 0,
            "ttft": 0,
            "tokens": 0,
            "tool_called": False,
            "preview": "",
            "error": str(e)[:50]
        }


def main():
    print("="*80)
    print(f"DETAILED COMPARISON: {MODEL_1} vs {MODEL_2}")
    print("="*80)
    
    results = {MODEL_1: [], MODEL_2: []}
    
    for i, test in enumerate(TESTS, 1):
        print(f"\n[Test {i}/{len(TESTS)}] {test['name']}")
        print("-" * 80)
        
        # Test Model 1
        print(f"  📊 {MODEL_1.split('/')[-1]}")
        result1 = test_model(MODEL_1, test)
        results[MODEL_1].append(result1)
        
        if result1["success"]:
            print(f"     Time: {result1['time']}s", end="")
            if result1['ttft']:
                print(f" | TTFT: {result1['ttft']}s", end="")
            if result1['tool_called'] is not None:
                print(f" | Tool: {'✓' if result1['tool_called'] else '✗'}", end="")
            print()
            print(f"     Preview: {result1['preview']}...")
        else:
            print(f"     ❌ Error: {result1['error']}")
        
        time.sleep(0.5)
        
        # Test Model 2
        print(f"\n  📊 {MODEL_2.split('/')[-1]}")
        result2 = test_model(MODEL_2, test)
        results[MODEL_2].append(result2)
        
        if result2["success"]:
            print(f"     Time: {result2['time']}s", end="")
            if result2['ttft']:
                print(f" | TTFT: {result2['ttft']}s", end="")
            if result2['tool_called'] is not None:
                print(f" | Tool: {'✓' if result2['tool_called'] else '✗'}", end="")
            print()
            print(f"     Preview: {result2['preview']}...")
        else:
            print(f"     ❌ Error: {result2['error']}")
        
        # Winner for this test
        if result1["success"] and result2["success"]:
            if result1["time"] < result2["time"]:
                print(f"\n  🏆 Winner: {MODEL_1.split('/')[-1]} ({result1['time']}s vs {result2['time']}s)")
            else:
                print(f"\n  🏆 Winner: {MODEL_2.split('/')[-1]} ({result2['time']}s vs {result1['time']}s)")
        
        time.sleep(1)
    
    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    
    for model in [MODEL_1, MODEL_2]:
        model_results = results[model]
        successful = [r for r in model_results if r["success"]]
        
        if successful:
            avg_time = sum(r["time"] for r in successful) / len(successful)
            avg_ttft = sum(r["ttft"] for r in successful if r["ttft"]) / len([r for r in successful if r["ttft"]])
            total_tokens = sum(r["tokens"] for r in successful)
            tool_tests = [r for r in successful if r["tool_called"] is not None]
            tools_passed = sum(1 for r in tool_tests if r["tool_called"])
            
            print(f"\n{model.split('/')[-1]}:")
            print(f"  Successful tests: {len(successful)}/{len(TESTS)}")
            print(f"  Average time: {avg_time:.2f}s")
            print(f"  Average TTFT: {avg_ttft:.2f}s")
            print(f"  Total tokens: {total_tokens}")
            if tool_tests:
                print(f"  Tool calling: {tools_passed}/{len(tool_tests)} passed")
    
    # Overall winner
    model1_results = [r for r in results[MODEL_1] if r["success"]]
    model2_results = [r for r in results[MODEL_2] if r["success"]]
    
    if model1_results and model2_results:
        avg1 = sum(r["time"] for r in model1_results) / len(model1_results)
        avg2 = sum(r["time"] for r in model2_results) / len(model2_results)
        
        print("\n" + "="*80)
        if avg1 < avg2:
            speedup = ((avg2 - avg1) / avg2) * 100
            print(f"🏆 OVERALL WINNER: {MODEL_1}")
            print(f"   {speedup:.1f}% faster on average")
        else:
            speedup = ((avg1 - avg2) / avg1) * 100
            print(f"🏆 OVERALL WINNER: {MODEL_2}")
            print(f"   {speedup:.1f}% faster on average")
        print("="*80)


if __name__ == "__main__":
    main()
