import pytest
from services.gemma_client import simplify_chunk_text, extract_important_concepts, generate_comprehension_question

@pytest.mark.anyio
async def test_gemma_simplification_generation():
    sample_text = "An object at rest stays at rest and an object in motion stays in motion unless acted on by a net force."
    result = await simplify_chunk_text(sample_text)
    assert len(result) > 20
    assert "concept" in result.lower() or "analogy" in result.lower() or "inertia" in result.lower() or "motion" in result.lower()

@pytest.mark.anyio
async def test_gemma_important_concepts_extraction():
    sample_text = "Newton's Second Law defines F = ma as the fundamental equation of motion."
    result = await extract_important_concepts(sample_text)
    assert "is_important" in result
    assert result["is_important"] is True
    assert "concept_name" in result

@pytest.mark.anyio
async def test_gemma_comprehension_question_generation():
    sample_text = "For every action, there is an equal and opposite reaction."
    result = await generate_comprehension_question(sample_text)
    assert "question" in result
    assert "options" in result
    assert len(result["options"]) == 4
    assert "correct_index" in result
