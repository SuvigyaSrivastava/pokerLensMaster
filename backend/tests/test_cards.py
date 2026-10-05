from cards import UNKNOWN, normalize_card, normalize_detection


def test_normalize_card_variants():
    assert normalize_card("as") == "As"
    assert normalize_card("10h") == "Th"
    assert normalize_card(" Kc ") == "Kc"
    assert normalize_card("??") == UNKNOWN
    assert normalize_card("Zx") == UNKNOWN
    assert normalize_card(None) == UNKNOWN


def test_duplicate_card_demoted_and_street_derived():
    out = normalize_detection(
        {"hero_cards": ["As", "Kd"], "board_cards": ["As", "7c", "2d"], "street": "river", "confidence": "high"}
    )
    assert out["board_cards"][0] == UNKNOWN  # impossible duplicate
    assert out["street"] == "flop"            # derived from board length, not the model
    assert out["confidence"] == "medium"      # downgraded: unreadable card present


def test_limits_and_garbage():
    out = normalize_detection({"hero_cards": ["As", "Kd", "2c"], "board_cards": "oops", "confidence": "??"})
    assert len(out["hero_cards"]) == 2
    assert out["board_cards"] == [] and out["street"] == "preflop"
    assert out["confidence"] == "low"
