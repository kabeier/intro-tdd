def get_user_input():
    user_input = input("Enter a number: ")
    return int(user_input)

def test_get_user_input(monkeypatch):
    # Simulate user input
    monkeypatch.setattr("builtins.input", lambda _: "42")
    result = get_user_input()
    assert result == 42

def get_multiple_inputs():
    num1 = int(input("Enter the first number: "))
    num2 = int(input("Enter the second number: "))
    return num1 + num2

def test_get_multiple_inputs(monkeypatch):
    user_inputs = ["5", "7"]
    input_values = iter(user_inputs)
    monkeypatch.setattr("builtins.input", lambda _: next(input_values))
    assert get_multiple_inputs() == 5 + 7
