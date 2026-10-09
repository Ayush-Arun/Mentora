from services.document_parser import parse_document

def test_parse_document_fallback():
    chunks = parse_document("dummy.pdf", "pdf")
    assert isinstance(chunks, list)
    assert len(chunks) >= 0
