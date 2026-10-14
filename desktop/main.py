import json
import sys
from pathlib import Path

from PySide6.QtCore import QByteArray, QObject, QPoint, Qt, QTimer, QUrl
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
    QScrollArea,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)


def resource_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


API_BASE_URL = "https://bot-silence-production.up.railway.app"


class ApiClient(QObject):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.network = QNetworkAccessManager(self)
        self.base_url = API_BASE_URL
        self.access_token = ""

    def redeem(self, code: str, callback):
        self._post("/api/evento/auth/redeem", {"code": code}, callback, authenticated=False)

    def heartbeat(self, callback):
        self._post("/api/evento/heartbeat", {}, callback)

    def start_new_edition(self, modality: str, callback):
        self._post(
            "/api/evento/edition/new",
            {"modality": modality},
            callback,
        )

    def change_game(self, game: int, callback):
        self._post("/api/evento/game/change", {"game": game}, callback)

    def set_game_status(self, running: bool, callback):
        self._post("/api/evento/game/status", {"running": running}, callback)

    def logout(self, callback=None):
        self._post("/api/evento/logout", {}, callback or (lambda *_: None))

    def _post(self, path: str, payload: dict, callback, authenticated=True):
        request = self._request(path, authenticated)

        reply = self.network.post(
            request,
            QByteArray(json.dumps(payload).encode("utf-8")),
        )
        reply.finished.connect(lambda: self._finish(reply, callback))

    def _get(self, path: str, callback):
        reply = self.network.get(self._request(path, True))
        reply.finished.connect(lambda: self._finish(reply, callback))

    def _request(self, path: str, authenticated: bool):
        request = QNetworkRequest(QUrl(f"{self.base_url}{path}"))
        request.setHeader(QNetworkRequest.ContentTypeHeader, "application/json")
        request.setRawHeader(b"Accept", b"application/json")
        if authenticated and self.access_token:
            request.setRawHeader(
                b"Authorization", f"Bearer {self.access_token}".encode("utf-8")
            )
        return request

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
        self.game_running = False

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
        self.pages.addWidget(self.build_edition_setup_page())
        self.pages.addWidget(self.build_modality_page())
        self.pages.addWidget(self.build_control_page())
        self.pages.addWidget(self.build_game_page())
        shell_layout.addWidget(self.pages)
        self.setCentralWidget(shell)

        self.resize(390, 270)

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

    def build_edition_setup_page(self) -> QWidget:
        page = QWidget()
        page.setObjectName("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 28, 24, 28)
        layout.setSpacing(14)

        heading = QLabel("CONFIGURAÇÃO DA EDIÇÃO")
        heading.setObjectName("heading")
        heading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(heading)

        subtitle = QLabel("Como deseja iniciar o painel?")
        subtitle.setObjectName("muted")
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(subtitle)
        layout.addStretch()

        new_edition = QPushButton("✨  NOVA EDIÇÃO")
        new_edition.setObjectName("commandButton")
        new_edition.setMinimumHeight(64)
        new_edition.clicked.connect(lambda: self.pages.setCurrentIndex(2))
        layout.addWidget(new_edition)

        continue_edition = QPushButton("▶  CONTINUAR EDIÇÃO ATUAL")
        continue_edition.setObjectName("secondaryButton")
        continue_edition.setMinimumHeight(52)
        continue_edition.clicked.connect(self.continue_current_edition)
        layout.addWidget(continue_edition)
        layout.addStretch()
        return page

    def build_modality_page(self) -> QWidget:
        page = QWidget()
        page.setObjectName("page")
        layout = QVBoxLayout(page)
        layout.setContentsMargins(22, 24, 22, 24)
        layout.setSpacing(10)

        heading = QLabel("ESCOLHA A MODALIDADE")
        heading.setObjectName("heading")
        heading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(heading)

        mapping = [
            ("QUARTETO", "quarteto", 0),
            ("TRIO", "trio", 1),
            ("DUPLA", "dupla", 2),
            ("NORMAL", "normal", 3),
        ]
        self.modality_buttons = []
        for label, name, value in mapping:
            button = QPushButton(f"{label}")
            button.setObjectName("commandButton")
            button.setMinimumHeight(50)
            button.clicked.connect(
                lambda _checked=False, selected=name: self.create_new_edition(selected)
            )
            self.modality_buttons.append(button)
            layout.addWidget(button)

        self.modality_status = QLabel("")
        self.modality_status.setObjectName("status")
        self.modality_status.setWordWrap(True)
        self.modality_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.modality_status)

        back = QPushButton("VOLTAR")
        back.setObjectName("secondaryButton")
        back.clicked.connect(lambda: self.pages.setCurrentIndex(1))
        layout.addWidget(back)
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

        self.edition_label = QLabel("EDIÇÃO ATUAL")
        self.edition_label.setObjectName("sectionTitle")
        self.edition_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.edition_label)

        self.command_status = QLabel("Painel pronto para receber os próximos comandos.")
        self.command_status.setObjectName("status")
        self.command_status.setWordWrap(True)
        self.command_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.command_status)

        change_game = QPushButton("🎮  TROCAR DE JOGO")
        change_game.setObjectName("commandButton")
        change_game.setMinimumHeight(58)
        change_game.clicked.connect(self.open_game_page)
        layout.addWidget(change_game)

        self.game_status_button = QPushButton("▶  INICIAR JOGO")
        self.game_status_button.setObjectName("gameStatusButton")
        self.game_status_button.setProperty("running", False)
        self.game_status_button.setMinimumHeight(58)
        self.game_status_button.clicked.connect(self.toggle_game_status)
        layout.addWidget(self.game_status_button)
        layout.addStretch()

        logout = QPushButton("ENCERRAR SESSÃO")
        logout.setObjectName("secondaryButton")
        logout.clicked.connect(self.logout)
        layout.addWidget(logout)
        return page

    def build_game_page(self) -> QWidget:
        page = QWidget()
        page.setObjectName("page")
        outer = QVBoxLayout(page)
        outer.setContentsMargins(14, 16, 14, 16)
        outer.setSpacing(10)

        heading = QLabel("TROCAR DE JOGO")
        heading.setObjectName("heading")
        heading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        outer.addWidget(heading)

        scroll = QScrollArea()
        scroll.setObjectName("gameScroll")
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        content = QWidget()
        content.setObjectName("scrollContent")
        game_layout = QVBoxLayout(content)
        game_layout.setContentsMargins(4, 4, 4, 4)
        game_layout.setSpacing(7)

        games = [
            "Fechar",
            "Fuja",
            "Massacre",
            "Danger",
            "Cruzamento",
            "Cruza Danger",
            "Cruzamento 2.0",
            "Pegue o Drink",
            "Fuja com Assentos",
            "Fuja 2.0",
            "Fuja 3.0",
            "Fujamento",
            "Fujamento 3.0",
            "Corra",
            "Fuja Roller",
            "Coletivo",
            "Queimada",
        ]
        self.game_buttons = []
        for value, name in enumerate(games):
            button = QPushButton(name)
            button.setObjectName("gameButton")
            button.setMinimumHeight(40)
            button.clicked.connect(
                lambda _checked=False, selected=value: self.select_game(selected)
            )
            self.game_buttons.append(button)
            game_layout.addWidget(button)
        game_layout.addStretch()
        scroll.setWidget(content)
        outer.addWidget(scroll, 1)

        self.game_status = QLabel("")
        self.game_status.setObjectName("status")
        self.game_status.setWordWrap(True)
        self.game_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        outer.addWidget(self.game_status)

        back = QPushButton("VOLTAR")
        back.setObjectName("secondaryButton")
        back.clicked.connect(lambda: self.pages.setCurrentIndex(3))
        outer.addWidget(back)
        return page

    def authenticate(self):
        code = self.code_input.text().strip()
        if not code:
            self.set_login_status("Informe o código recebido no Discord.", error=True)
            return

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

        self.code_input.clear()
        user = data.get("user", {})
        self.user_label.setText(user.get("habbo_username") or "HOST")
        self.set_game_running(False)
        self.pages.setCurrentIndex(1)
        self.resize(320, 430)
        self.heartbeat_timer.start()

    def continue_current_edition(self):
        self.edition_label.setText("EDIÇÃO ATUAL MANTIDA")
        self.command_status.setText("Nenhuma variável foi alterada.")
        self.pages.setCurrentIndex(3)
        self.resize(270, 540)

    def create_new_edition(self, modality: str):
        for button in self.modality_buttons:
            button.setEnabled(False)
        self.modality_status.setText("Criando nova edição...")
        self.api.start_new_edition(
            modality,
            lambda status, data: self.on_new_edition(status, data),
        )

    def on_new_edition(self, status: int, data: dict):
        for button in self.modality_buttons:
            button.setEnabled(True)
        if status != 200:
            self.modality_status.setText(
                data.get("message", "Não foi possível criar a nova edição.")
            )
            self.modality_status.setProperty("error", True)
            self.refresh_style(self.modality_status)
            if status == 401:
                self.return_to_login("A sessão expirou. Solicite uma nova autorização.")
            return

        edition = data.get("edition", "?")
        modality = str(data.get("modality", "")).upper()
        duration = data.get("duration_ms")
        timing = f" • {duration} ms" if duration is not None else ""
        self.edition_label.setText(f"EDIÇÃO {edition} • {modality}")
        self.command_status.setText(f"Nova edição configurada{timing}.")
        self.modality_status.setText("")
        self.pages.setCurrentIndex(3)
        self.resize(270, 540)

    def open_game_page(self):
        self.game_status.setText("")
        self.pages.setCurrentIndex(4)
        self.resize(285, 620)

    def select_game(self, game: int):
        for button in self.game_buttons:
            button.setEnabled(False)
        self.game_status.setText("Alterando jogo...")
        self.api.change_game(game, self.on_game_changed)

    def on_game_changed(self, status: int, data: dict):
        for button in self.game_buttons:
            button.setEnabled(True)
        if status != 200:
            self.game_status.setText(data.get("message", "Não foi possível trocar o jogo."))
            self.game_status.setProperty("error", True)
            self.refresh_style(self.game_status)
            if status == 401:
                self.return_to_login("A sessão expirou. Solicite uma nova autorização.")
            return

        game = str(data.get("game", "Jogo")).title()
        duration = data.get("duration_ms")
        timing = f" • {duration} ms" if duration is not None else ""
        self.command_status.setText(f"Jogo atual: {game}{timing}")
        self.set_game_running(False)
        self.pages.setCurrentIndex(3)
        self.resize(270, 540)

    def toggle_game_status(self):
        target_running = not self.game_running
        self.game_status_button.setEnabled(False)
        action = "Iniciando" if target_running else "Parando"
        self.command_status.setText(f"{action} jogo...")
        self.api.set_game_status(
            target_running,
            lambda status, data: self.on_game_status_changed(
                status, data, target_running
            ),
        )

    def on_game_status_changed(self, status: int, data: dict, target_running: bool):
        self.game_status_button.setEnabled(True)
        if status != 200:
            self.command_status.setText(
                data.get("message", "Não foi possível alterar o status do jogo.")
            )
            self.command_status.setProperty("error", True)
            self.refresh_style(self.command_status)
            if status == 401:
                self.return_to_login("A sessão expirou. Solicite uma nova autorização.")
            return

        self.set_game_running(target_running)
        duration = data.get("duration_ms")
        timing = f" • {duration} ms" if duration is not None else ""
        state = "iniciado" if target_running else "parado"
        self.command_status.setText(f"Jogo {state}{timing}.")
        self.command_status.setProperty("error", False)
        self.refresh_style(self.command_status)

    def set_game_running(self, running: bool):
        self.game_running = running
        self.game_status_button.setText(
            "⏹  PARAR JOGO" if running else "▶  INICIAR JOGO"
        )
        self.game_status_button.setProperty("running", running)
        self.refresh_style(self.game_status_button)

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
        self.resize(390, 270)
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
