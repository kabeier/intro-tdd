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
