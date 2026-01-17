/*
run tests on new KCPLink(_,initial-value)
and also on KCL.root = VALUE
test values such as:
string
number
boolean
null (should be real value, not just delete op)
undefined (should be same as delete op)
Symbol
object
array
Constructor(Number/String/Boolean)
Date (new Date(), not `Date` constructor)
*/