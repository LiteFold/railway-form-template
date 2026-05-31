import py_compile
import sys

files = ['app/forms.py', 'app/cap_api.py', 'app/admin.py', 'app/rate_limit.py', 'app/main.py']
for f in files:
    try:
        py_compile.compile(f, doraise=True)
        print(f'OK: {f}')
    except py_compile.PyCompileError as e:
        print(f'FAIL: {f}: {e}')
        sys.exit(1)
print('All files compile OK')
