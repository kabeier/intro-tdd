def test_printing(capsys):
    print("Hello, pytest!")
    captured = capsys.readouterr()
    assert captured.out == "Hello, pytest!\n"
