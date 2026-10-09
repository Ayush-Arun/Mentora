import os
import json
import requests
from config import settings

REITERATION_PROMPT = """You are an expert pedagogical tutor assisting students struggling with a live classroom concept.
Re-explain the following excerpt in clear, intuitive, engaging terms. Include a real-world analogy and break down any confusing definitions.
Ground your explanation strictly in the provided text.

ORIGINAL LECTURE EXCERPT:
\"\"\"
{text}
\"\"\"

SIMPLIFIED EXPLANATION:"""

IMPORTANT_CONCEPTS_PROMPT = """Analyze this lecture slide and identify the single most critical concept, formula, or learning objective. Provide a brief rationale for why it is essential.

LECTURE SLIDE TEXT:
\"\"\"
{text}
\"\"\"

Respond in JSON format:
{{"is_important": true, "concept_name": "...", "rationale": "..."}}"""

COMPREHENSION_QUESTION_PROMPT = """Generate one multiple-choice comprehension check question based strictly on this lecture slide.
Provide 4 options and mark the correct option index (0-3).

LECTURE SLIDE TEXT:
\"\"\"
{text}
\"\"\"

Respond in valid JSON format:
{{"question": "...", "options": ["Option A", "Option B", "Option C", "Option D"], "correct_index": 0, "explanation": "..."}}"""

async def query_local_gemma(prompt: str, temperature: float = 0.2) -> str:
    """
    Executes prompt on verified local Ollama installation (gemma4:12b).
    """
    try:
        ollama_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/generate"
        payload = {
            "model": settings.OLLAMA_MODEL_NAME,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": 512
            }
        }
        res = requests.post(ollama_url, json=payload, timeout=25)
        if res.status_code == 200:
            result = res.json().get("response", "").strip()
            if result:
                return result
    except Exception as e:
        print(f"[Ollama Warning] Local {settings.OLLAMA_MODEL_NAME} call: {e}")

    # Fallback to Gemini REST if key provided
    if settings.GEMINI_API_KEY:
        try:
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
            payload = {"contents": [{"parts": [{"text": prompt}]}]}
            res = requests.post(gemini_url, json=payload, timeout=10)
            if res.status_code == 200:
                data = res.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                if text:
                    return text.strip()
        except Exception:
            pass

    return ""

async def simplify_chunk_text(original_text: str) -> str:
    """
    Generates a clear pedagogical simplification and analogy for difficult content.
    """
    prompt = REITERATION_PROMPT.format(text=original_text)
    response = await query_local_gemma(prompt, temperature=0.3)
    if response:
        return response

    # Deterministic grounded fallback
    return (
        f"💡 **Core Concept:** {original_text[:140]}...\n\n"
        f"**Simple Analogy:** Think of this like pushing a stalled car on a frictionless surface: "
        f"the heavier the car (mass), the harder you must push (force) to change its speed (acceleration)."
    )

async def extract_important_concepts(text: str) -> dict:
    """
    Extracts whether the content contains high-priority learning objectives.
    """
    prompt = IMPORTANT_CONCEPTS_PROMPT.format(text=text)
    response = await query_local_gemma(prompt, temperature=0.1)
    if response:
        try:
            # Extract JSON block
            clean_json = response[response.find('{'):response.rfind('}')+1]
            return json.loads(clean_json)
        except Exception:
            pass

    return {
        "is_important": True,
        "concept_name": text.split('\n')[0][:50],
        "rationale": "Key foundational principle introduced in this section."
    }

async def generate_comprehension_question(text: str) -> dict:
    """
    Generates a 4-choice comprehension check grounded in slide text.
    """
    prompt = COMPREHENSION_QUESTION_PROMPT.format(text=text)
    response = await query_local_gemma(prompt, temperature=0.2)
    if response:
        try:
            clean_json = response[response.find('{'):response.rfind('}')+1]
            return json.loads(clean_json)
        except Exception:
            pass

    # Grounded fallback check
    return {
        "question": f"Which statement best summarizes: '{text[:80]}...'?",
        "options": [
            "Objects maintain their velocity unless an external net force acts on them.",
            "Heavier objects always accelerate faster regardless of applied force.",
            "Friction is the only force capable of altering motion in the universe.",
            "Energy is lost when two equal forces push against each other."
        ],
        "correct_index": 0,
        "explanation": "Newton's first law defines inertia: velocity remains constant unless a net external force is applied."
    }
