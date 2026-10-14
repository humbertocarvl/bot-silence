import json
import sys
from pathlib import Path
from urllib.parse import urlparse

from PySide6.QtCore import QByteArray, QObject, QPoint, QSettings, Qt, QTimer, QUrl
from PySide6.QtGui import QCloseEvent, QMouseEvent
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)


def resource_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


class ApiClient(QObject):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.network = QNetworkAccessManager(self)
        self.base_url = ""
        self.access_token = ""

    def configure(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def redeem(self, code: str, callback):
        self._post("/api/evento/auth/redeem", {"code": code}, callback, authenticated=False)

    def heartbeat(self, callback):
        self._post("/api/evento/heartbeat", {}, callback)

    def execute_test(self, callback):
        self._post("/api/evento/command", {"command": "test"}, callback)

    def logout(self, callback=None):
        self._post("/api/evento/logout", {}, callback or (lambda *_: None))

    def _post(self, path: str, payload: dict, callback, authenticated=True):
        request = QNetworkRequest(QUrl(f"{self.base_url}{path}"))
        request.setHeader(QNetworkRequest.ContentTypeHeader, "application/json")
        request.setRawHeader(b"Accept", b"application/json")
        if authenticated and self.access_token:
            request.setRawHeader(
                b"Authorization", f"Bearer {self.access_token}".encode("utf-8")
            )

        reply = self.network.post(
            request,
            QByteArray(json.dumps(payload).encode("utf-8")),
        )
        reply.finished.connect(lambda: self._finish(reply, callback))

    @staticmethod
    def _finish(reply: QNetworkReply, callback):
        status = reply.attribute(QNetworkRequest.HttpStatusCodeAttribute) or 0
        raw = bytes(reply.readAll()).decode("utf-8", errors="replace")
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"message": "O servidor retornou uma resposta inválida."}

        network_error = reply.error() != QNetworkReply.NetworkError.NoError and status == 0
        if network_error:
            data = {"message": "Não foi possível conectar ao servidor do Silence."}
        reply.deleteLater()
        callback(int(status), data)


class TitleBar(QFrame):
    def __init__(self, window):
        super().__init__()
        self.window = window
        self.drag_position = QPoint()
        self.setObjectName("titleBar")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(12, 7, 7, 7)
        title = QLabel("SILENCE")
        title.setObjectName("brand")
        layout.addWidget(title)
        layout.addStretch()

        minimize = QPushButton("—")
        minimize.setObjectName("windowButton")
        minimize.setFixedSize(28, 25)
        minimize.clicked.connect(window.showMinimized)
        layout.addWidget(minimize)

        close = QPushButton("×")
        close.setObjectName("closeButton")
        close.setFixedSize(28, 25)
        close.clicked.connect(window.close)
        layout.addWidget(close)

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_position = (
                event.globalPosition().toPoint() - self.window.frameGeometry().topLeft()
            )
            event.accept()

    def mouseMoveEvent(self, event: QMouseEvent):
        if event.buttons() & Qt.MouseButton.LeftButton:
            self.window.move(event.globalPosition().toPoint() - self.drag_position)
            event.accept()


class SilenceWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Silence")
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.settings = QSettings("Silence", "EventPanel")
        self.api = ApiClient(self)
        self.heartbeat_timer = QTimer(self)
        self.heartbeat_timer.setInterval(30_000)
        self.heartbeat_timer.timeout.connect(self.send_heartbeat)

        shell = QFrame()
        shell.setObjectName("shell")
        shell_layout = QVBoxLayout(shell)
        shell_layout.setContentsMargins(0, 0, 0, 0)
        shell_layout.setSpacing(0)
        shell_layout.addWidget(TitleBar(self))

        self.pages = QStackedWidget()
        self.pages.addWidget(self.build_login_page())
        self.pages.addWidget(self.build_control_page())
        shell_layout.addWidget(self.pages)
        self.setCentralWidget(shell)

        self.resize(390, 315)

    def build_login_page(self) -> QWidget:
        page = QWidget()
        page.setObjectName("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(28, 24, 28, 28)
        layout.setSpacing(12)

        heading = QLabel("PAINEL DE EVENTOS")
        heading.setObjectName("heading")
        heading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(heading)

        subtitle = QLabel("Insira o código recebido pelo bot no Discord.")
        subtitle.setObjectName("muted")
        subtitle.setWordWrap(True)
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(subtitle)

        self.api_url_input = QLineEdit(
            self.settings.value("api_url", "https://SEU-SERVICO.up.railway.app")
        )
        self.api_url_input.setPlaceholderText("URL do servidor Silence")
        layout.addWidget(self.api_url_input)

        self.code_input = QLineEdit()
        self.code_input.setPlaceholderText("SILENCE-...")
        self.code_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.code_input.returnPressed.connect(self.authenticate)
        layout.addWidget(self.code_input)

        self.login_status = QLabel("")
        self.login_status.setObjectName("status")
        self.login_status.setWordWrap(True)
        self.login_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.login_status)

        self.login_button = QPushButton("ENTRAR")
        self.login_button.setObjectName("primaryButton")
        self.login_button.clicked.connect(self.authenticate)
        layout.addWidget(self.login_button)
        return page

    def build_control_page(self) -> QWidget:
        page = QWidget()
        page.setObjectName("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(18, 20, 18, 20)
        layout.setSpacing(14)

        badge = QLabel("● AUTORIZADO")
        badge.setObjectName("authorized")
        badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(badge)

        self.user_label = QLabel("HOST")
        self.user_label.setObjectName("heading")
        self.user_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.user_label)

        divider = QFrame()
        divider.setFrameShape(QFrame.Shape.HLine)
        divider.setObjectName("divider")
        layout.addWidget(divider)

        command_title = QLabel("COMANDOS")
        command_title.setObjectName("sectionTitle")
        layout.addWidget(command_title)

        self.test_button = QPushButton("⚡  SOMAR +1")
        self.test_button.setObjectName("commandButton")
        self.test_button.setMinimumHeight(62)
        self.test_button.clicked.connect(self.execute_test)
        layout.addWidget(self.test_button)

        self.command_status = QLabel("Painel pronto.")
        self.command_status.setObjectName("status")
        self.command_status.setWordWrap(True)
        self.command_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.command_status)
        layout.addStretch()

        logout = QPushButton("ENCERRAR SESSÃO")
        logout.setObjectName("secondaryButton")
        logout.clicked.connect(self.logout)
        layout.addWidget(logout)
        return page

    def authenticate(self):
        api_url = self.api_url_input.text().strip().rstrip("/")
        code = self.code_input.text().strip()
        parsed = urlparse(api_url)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            self.set_login_status("Informe uma URL válida do servidor.", error=True)
            return
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            self.set_login_status("O servidor precisa usar HTTPS.", error=True)
            return
        if not code:
            self.set_login_status("Informe o código recebido no Discord.", error=True)
            return

        self.api.configure(api_url)
        self.login_button.setEnabled(False)
        self.set_login_status("Validando autorização...")
        self.api.redeem(code, self.on_authenticated)

    def on_authenticated(self, status: int, data: dict):
        self.login_button.setEnabled(True)
        if status != 200:
            self.set_login_status(data.get("message", "Código recusado."), error=True)
            return

        self.api.access_token = data.get("access_token", "")
        if not self.api.access_token:
            self.set_login_status("O servidor não retornou uma sessão válida.", error=True)
            return

        self.settings.setValue("api_url", self.api.base_url)
        self.code_input.clear()
        user = data.get("user", {})
        self.user_label.setText(user.get("habbo_username") or "HOST")
        self.pages.setCurrentIndex(1)
        self.resize(270, 540)
        self.heartbeat_timer.start()
        self.command_status.setText("Painel pronto.")

    def execute_test(self):
        self.test_button.setEnabled(False)
        self.command_status.setText("Enviando comando...")
        self.api.execute_test(self.on_test_finished)

    def on_test_finished(self, status: int, data: dict):
        self.test_button.setEnabled(True)
        if status == 200:
            wired = data.get("wired", {})
            value = wired.get("value", "?")
            self.command_status.setText(f"✓ Novo valor: {value}")
            self.command_status.setProperty("error", False)
        else:
            self.command_status.setText(data.get("message", "Falha ao executar o comando."))
            self.command_status.setProperty("error", True)
            if status == 401:
                self.return_to_login("A sessão expirou. Solicite uma nova autorização.")
        self.refresh_style(self.command_status)

    def send_heartbeat(self):
        if self.api.access_token:
            self.api.heartbeat(self.on_heartbeat)

    def on_heartbeat(self, status: int, data: dict):
        if status == 401:
            self.return_to_login("A sessão expirou. Solicite uma nova autorização.")

    def logout(self):
        if self.api.access_token:
            self.api.logout()
        self.return_to_login("Sessão encerrada.")

    def return_to_login(self, message: str):
        self.heartbeat_timer.stop()
        self.api.access_token = ""
        self.pages.setCurrentIndex(0)
        self.resize(390, 315)
        self.set_login_status(message)

    def set_login_status(self, message: str, error=False):
        self.login_status.setText(message)
        self.login_status.setProperty("error", error)
        self.refresh_style(self.login_status)

    @staticmethod
    def refresh_style(widget):
        widget.style().unpolish(widget)
        widget.style().polish(widget)

    def closeEvent(self, event: QCloseEvent):
        self.heartbeat_timer.stop()
        if self.api.access_token:
            self.api.logout()
        event.accept()


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Silence")
    app.setOrganizationName("Silence")
    theme = resource_path("theme.qss")
    if theme.exists():
        app.setStyleSheet(theme.read_text(encoding="utf-8"))

    window = SilenceWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
