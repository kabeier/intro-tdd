# Code and commands, in order

Every file both lectures type, as it ends up (also in `demo-kit/tdd-pytest/` and `demo-kit/tdd-jest/`). What each step prints is in the Code Labs, captured from real pytest / Jest / Node.

## Lecture 1: Intro to TDD with pytest (folder `tdd-pytest/`)
```bash
pip install pytest
pytest --version
mkdir tdd-pytest && cd tdd-pytest && code .
```

### Red, green, refactor (slide 7)
```bash
pytest test_example.py     # red: ImportError, exit 2
echo $?
pytest test_example.py     # green after writing example.py: 1 passed, exit 0
```

**test_example.py**
```python
from example import add_two_numbers

def test_add_two_numbers():
    assert add_two_numbers(2, 2) == 4
```

**example.py**
```python
def add_two_numbers(num_one, num_two):
    return num_one + num_two
```

### Assertions (slide 10). The "jam" test fails on purpose; remove "jam" to go green.
```bash
pytest -v test_assertions.py test_shopping.py
```

**test_assertions.py**
```python
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
```

**test_shopping.py**
```python
import pytest

def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError):
        1 / 0

def test_shopping_list():
    cart = ["milk", "eggs"]
    assert sorted(cart) == ["eggs", "milk", "jam"]
```

### monkeypatch and capsys (slide 11)
```bash
pytest -v test_input.py test_print.py
```

**test_input.py**
```python
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
```

**test_print.py**
```python
def test_printing(capsys):
    print("Hello, pytest!")
    captured = capsys.readouterr()
    assert captured.out == "Hello, pytest!\n"
```

### Docker demo (slide 12), from a copy of demo-kit/tdd-pytest/
```bash
docker build -t pytest-tests .
docker run --rm pytest-tests      # with "jam": 1 failed, 7 passed
echo $?                           # 1
# remove "jam", then build again and run: 8 passed, exit 0
```

**Dockerfile**
```js
FROM python:3.11-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir pytest

CMD ["pytest"]
```

## Lecture 2: TDD with Jest (folder `tdd-jest/`)
### Exports (slide 3)
```bash
node runner.js     # ReferenceError: factorial is not defined, until the export AND the require are in
```

**factorial.js**
```js
function factorial(num) {
  let product = 1;

  for (let i = num; i > 0; i--) {
    product = product * i;
  }

  return product;
}

module.exports = factorial;
```

**runner.js**
```js
const factorial = require("./factorial.js");

console.log(factorial(4));
```

### Set up Jest (slide 5)
```bash
npm init -y
# package.json: "test": "jest"
npm install --save-dev jest
npm test           # No tests found, exiting with code 1
```

**package.json**
```json
{
  "name": "tdd-jest",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "jest"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "devDependencies": {
    "jest": "^30.5.2"
  }
}
```

### First test (slide 7), then describe and skip (slide 10)
```bash
npm test           # PASS; change 24 to 23 → FAIL, Expected: 23 / Received: 24; echo $? → 1
```
The final spec (slide 10, with xtest and xdescribe):

**factorial.spec.js**
```js
const factorial = require("./factorial.js");

describe("tests factorial for small numbers", () => {
  test("tests factorial(0) = 1", () => {
    expect(factorial(0)).toBe(1);
  });

  xtest("tests factorial(3) = 6", () => {
    expect(factorial(3)).toBe(6);
  });
});

xdescribe("tests factorial for large numbers", () => {
  test("tests factorial(10) = 3628800", () => {
    expect(factorial(10)).toBe(3628800);
  });

  test("tests factorial(20) = 2432902008176640000", () => {
    expect(factorial(20)).toBe(2432902008176640000);
  });
});
```

### Docker demo (slide 11), from a copy of demo-kit/tdd-jest/ (it has a .dockerignore with node_modules)
```bash
docker build -t jest-tests .
docker run --rm jest-tests        # PASS, Tests: 3 skipped, 1 passed
echo $?                           # 0
```

**Dockerfile**
```js
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm install --save-dev jest

COPY . .

CMD ["npm", "test"]
```

## Homework: the "Or ask Claude" prompt
```
Run git status and show me the list of files. Then suggest a commit message for my solution and wait for my approval. After I approve, commit and push to my fork.
```
