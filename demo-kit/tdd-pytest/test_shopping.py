import pytest

def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError):
        1 / 0

def test_shopping_list():
    cart = ["milk", "eggs"]
    assert sorted(cart) == ["eggs", "milk"]
