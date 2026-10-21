import math

def test_comparisons():
    assert 2 + 2 == 4
    assert 3 * 5 != 11
    assert 10 > 5
    assert math.isclose(0.1 + 0.2, 0.3)

def test_membership_and_strings():
    assert "apple" in ["apple", "banana", "cherry"]
    assert "grape" not in ["apple", "banana", "cherry"]
    assert "Hello, world!".startswith("Hello")
