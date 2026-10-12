"""Verify the actual downloaded demo PDF, rather than renderer mocks."""
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
assert len(reader.pages) == 1
text = reader.pages[0].extract_text()
for expected in [
    "SF-2026-CREW-D-0001", "Demo Crew", "Demo Produkce s.r.o.",
    "Testovací 1", "Ukázková 10", "12345679", "87654321", "DEMO012",
    "19-2000145399/0800", "CZ6508000000192000145399", "2026-10-12", "2026-10-26",
]:
    assert expected in text, f"Required invoice content missing: {expected}"
assert "Faktura" in text.splitlines(), "The document should be labelled Faktura"
assert "DATUM PLNĚNÍ" in text, "The stored supply date must be visible"
assert "2 056,00 Kč" in text.replace("\u00a0", " "), "The correct total is missing"
print("PDF content verified: parties, Czech addresses, invoice number, payment details, dates and total.")
