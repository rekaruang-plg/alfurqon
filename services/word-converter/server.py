"""Private legacy Word converter. Run behind TLS; token required; no document retention."""
import hmac
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ['WORD_CONVERTER_TOKEN']
if len(TOKEN) < 32:
    raise RuntimeError('Use a token of at least 32 characters')
LIMIT = 10_000_000
SLOT = threading.BoundedSemaphore(2)
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/convert' or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            self.send_error(403); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(400); return
        if not 8 <= length <= LIMIT:
            self.send_error(413); return
        if not SLOT.acquire(blocking=False):
            self.send_error(503); return
        try:
            self.connection.settimeout(30)
            data = self.rfile.read(length)
            if len(data) != length or not data.startswith(bytes.fromhex('d0cf11e0a1b11ae1')):
                self.send_error(400); return
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / 'input.doc'
                source.write_bytes(data)
                profile = root / 'profile'
                profile.mkdir()
                # Highest macro security; fresh disposable profile per request.
                (profile / 'user').mkdir()
                (profile / 'user/registrymodifications.xcu').write_text('''<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>''')
                subprocess.run(['libreoffice', '-env:UserInstallation=' + profile.as_uri(), '--headless', '--convert-to', 'docx', '--outdir', directory, str(source)], timeout=35, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                target = root / 'input.docx'
                if not target.exists() or target.stat().st_size > LIMIT:
                    self.send_error(422); return
                result = target.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                self.send_header('Content-Length', str(len(result)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(result)
        except (OSError, subprocess.SubprocessError):
            self.send_error(422)
        finally:
            SLOT.release()
    def log_message(self, *args):
        pass
if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
