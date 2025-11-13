function foo {
  input {
    int score
  }
  stack {
    var $x1 {
      value = $input.score + 1
    }
  }
  response = $x1
}
