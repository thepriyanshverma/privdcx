import subprocess

res = subprocess.run(['docker', 'logs', 'infraos-gateway'], capture_output=True, text=True)
lines = (res.stdout + res.stderr).split('\n')

with open('debug_auth.txt', 'w') as f:
    for line in lines:
        if 'DEBUG Auth' in line:
            f.write(line + '\n')
