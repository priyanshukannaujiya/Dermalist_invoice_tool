"""
Test Groq LLM integration with sample user prompt.
"""

import os
from dotenv import load_dotenv
from services.groq_service import GroqService

load_dotenv()


def test_groq_invoice_extraction():
    groq_svc = GroqService()
    prompt = (
        "Generate a non-GST invoice for Aaditi Abhijeet Raut for ₹2,500 for "
        "one promotional video, dated 29 October 2026, with a discount of ₹200."
    )
    res = groq_svc.parse_invoice_request(prompt)

    assert res.get("creator_name") == "Aaditi Abhijeet Raut"
    assert res.get("unit_price") == 2500.0
    assert res.get("discount") == 200.0
    assert res.get("quantity") == 1
    assert "video" in res.get("service_description", "").lower()
    assert res.get("is_complete") is True
