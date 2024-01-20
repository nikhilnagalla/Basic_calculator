inp=float(input(" Input first value: "))
inp1=float(input("Input second value: "))

inp2=input("Arithemetic operation: ")
if "-" in inp2:
    print(inp-inp1)
elif"+" in inp2:
    print(inp+inp1)
elif "*" in inp2:
    print(inp*inp1)
elif "/" in inp2:
    print(inp/inp1)
else:
    print("error value entered")

