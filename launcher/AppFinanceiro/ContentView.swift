import SwiftUI

struct ContentView: View {
    // MARK: - Hardcoded project path (works from anywhere)
    private let projectDir = "\(NSHomeDirectory())/Desktop/Projetos-Pessoais/app-financeiro"

    @State private var isRunning = false
    @State private var isLoading = false
    @State private var logs: [LogEntry] = []
    @State private var currentPhase = ""

    struct LogEntry: Identifiable {
        let id = UUID()
        let text: String
        let type: LogType
        let time = Date()

        enum LogType { case info, success, error, output }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView

            Divider().opacity(0.3)

            // Action buttons
            buttonsView
                .padding(.horizontal, 20)
                .padding(.vertical, 14)

            Divider().opacity(0.3)

            // Logs area
            logsView
        }
        .frame(width: 360, height: 420)
        .background(.ultraThinMaterial)
        .onAppear { checkStatus() }
    }

    // MARK: - Header
    private var headerView: some View {
        HStack {
            Image(systemName: "dollarsign.circle.fill")
                .font(.system(size: 22))
                .foregroundStyle(.linearGradient(
                    colors: [.purple, .indigo],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
            VStack(alignment: .leading, spacing: 1) {
                Text("App Financeiro")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                Text(projectDir)
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Spacer()
            statusBadge
        }
        .padding(.horizontal, 20)
        .padding(.top, 18)
        .padding(.bottom, 12)
    }

    private var statusBadge: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(isRunning ? Color.green : (isLoading ? Color.orange : Color.gray.opacity(0.4)))
                .frame(width: 7, height: 7)
                .shadow(color: isRunning ? .green.opacity(0.5) : .clear, radius: 3)
            Text(isLoading ? currentPhase : (isRunning ? "Rodando" : "Parado"))
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial)
        .cornerRadius(12)
    }

    // MARK: - Buttons (only 2)
    private var buttonsView: some View {
        HStack(spacing: 10) {
            // START (also opens browser after ready)
            Button(action: startApp) {
                HStack(spacing: 6) {
                    if isLoading && !isRunning {
                        ProgressView()
                            .scaleEffect(0.6)
                            .frame(width: 14, height: 14)
                    } else {
                        Image(systemName: "play.fill")
                            .font(.system(size: 11))
                    }
                    Text("Iniciar")
                        .font(.system(size: 12, weight: .medium))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .buttonStyle(ActionButtonStyle(color: .green))
            .disabled(isRunning || isLoading)

            // STOP
            Button(action: stopApp) {
                HStack(spacing: 6) {
                    if isLoading && isRunning {
                        ProgressView()
                            .scaleEffect(0.6)
                            .frame(width: 14, height: 14)
                    } else {
                        Image(systemName: "stop.fill")
                            .font(.system(size: 11))
                    }
                    Text("Parar")
                        .font(.system(size: 12, weight: .medium))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .buttonStyle(ActionButtonStyle(color: .red))
            .disabled(!isRunning || isLoading)
        }
    }

    // MARK: - Logs
    private var logsView: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Logs")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                if !logs.isEmpty {
                    Button("Limpar") {
                        logs.removeAll()
                    }
                    .font(.system(size: 9))
                    .buttonStyle(.plain)
                    .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 6)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(logs) { entry in
                            logRow(entry)
                                .id(entry.id)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
                }
                .onChange(of: logs.count) { _ in
                    if let last = logs.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
        .background(Color.black.opacity(0.15))
    }

    private func logRow(_ entry: LogEntry) -> some View {
        HStack(alignment: .top, spacing: 6) {
            let icon: String = {
                switch entry.type {
                case .info: return "▸"
                case .success: return "✓"
                case .error: return "✗"
                case .output: return " "
                }
            }()
            let color: Color = {
                switch entry.type {
                case .info: return .blue
                case .success: return .green
                case .error: return .red
                case .output: return .secondary
                }
            }()

            Text(icon)
                .font(.system(size: 9, design: .monospaced))
                .foregroundColor(color)
                .frame(width: 10)

            Text(entry.text)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(entry.type == .output ? .secondary : color)
                .textSelection(.enabled)
        }
        .padding(.vertical, 1)
    }

    // MARK: - Actions

    private func log(_ text: String, type: LogEntry.LogType = .info) {
        DispatchQueue.main.async {
            logs.append(LogEntry(text: text, type: type))
        }
    }

    private func startApp() {
        isLoading = true
        currentPhase = "Iniciando..."
        logs.removeAll()

        log("Iniciando App Financeiro...")
        log("Projeto: \(projectDir)", type: .output)

        // Check Docker first
        log("Verificando Docker...")
        currentPhase = "Docker..."

        runCommand("/usr/local/bin/docker", args: ["info"], silent: true) { exitCode, output in
            if exitCode != 0 {
                // Try /opt/homebrew path
                runCommand("/opt/homebrew/bin/docker", args: ["info"], silent: true) { exitCode2, output2 in
                    if exitCode2 != 0 {
                        // Try just "docker" in PATH
                        runCommand("/usr/bin/env", args: ["docker", "info"], silent: true) { exitCode3, _ in
                            if exitCode3 != 0 {
                                log("Docker não está rodando!", type: .error)
                                log("Abra o Docker Desktop primeiro.", type: .error)
                                isLoading = false
                                currentPhase = ""
                                return
                            }
                            proceedWithStart()
                        }
                    } else {
                        proceedWithStart()
                    }
                }
            } else {
                proceedWithStart()
            }
        }
    }

    private func proceedWithStart() {
        log("Docker OK", type: .success)
        currentPhase = "Building..."
        log("Executando docker compose up --build ...")

        runCommand("/usr/bin/env", args: ["docker", "compose", "up", "-d", "--build"],
                    cwd: projectDir, streamOutput: true) { exitCode, output in
            if exitCode != 0 {
                log("Erro ao iniciar (exit \(exitCode))", type: .error)
                if !output.isEmpty {
                    for line in output.components(separatedBy: "\n").suffix(5) where !line.isEmpty {
                        log(line, type: .error)
                    }
                }
                isLoading = false
                currentPhase = ""
                return
            }

            log("Containers iniciados!", type: .success)
            currentPhase = "Aguardando..."
            log("Aguardando app ficar pronto...")

            // Wait and open browser
            waitAndOpenBrowser(retries: 15)
        }
    }

    private func waitAndOpenBrowser(retries: Int) {
        guard retries > 0 else {
            log("Timeout: app não respondeu a tempo", type: .error)
            log("Tente abrir manualmente: http://localhost:5173", type: .info)
            isRunning = true
            isLoading = false
            currentPhase = ""
            return
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/curl")
            task.arguments = ["-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:5173"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = Pipe()

            do {
                try task.run()
                task.waitUntilExit()
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                let status = String(data: data, encoding: .utf8) ?? ""

                if status.hasPrefix("2") || status.hasPrefix("3") || status == "200" {
                    DispatchQueue.main.async {
                        log("App pronto! Abrindo navegador...", type: .success)
                        NSWorkspace.shared.open(URL(string: "http://localhost:5173")!)
                        isRunning = true
                        isLoading = false
                        currentPhase = ""
                    }
                } else {
                    DispatchQueue.main.async {
                        log("Aguardando... (\(retries - 1) tentativas restantes)", type: .output)
                    }
                    waitAndOpenBrowser(retries: retries - 1)
                }
            } catch {
                DispatchQueue.main.async {
                    log("Aguardando resposta...", type: .output)
                }
                waitAndOpenBrowser(retries: retries - 1)
            }
        }
    }

    private func stopApp() {
        isLoading = true
        currentPhase = "Parando..."
        log("Parando containers...")

        runCommand("/usr/bin/env", args: ["docker", "compose", "down"],
                    cwd: projectDir, streamOutput: true) { exitCode, output in
            if exitCode != 0 {
                log("Erro ao parar (exit \(exitCode))", type: .error)
                for line in output.components(separatedBy: "\n").suffix(3) where !line.isEmpty {
                    log(line, type: .error)
                }
            } else {
                log("App parado.", type: .success)
            }
            isRunning = false
            isLoading = false
            currentPhase = ""
        }
    }

    private func checkStatus() {
        runCommand("/usr/bin/env", args: ["docker", "compose", "ps", "--format", "json"],
                   cwd: projectDir, silent: true) { exitCode, output in
            DispatchQueue.main.async {
                isRunning = exitCode == 0 && output.contains("running")
                if isRunning {
                    log("Containers já estão rodando.", type: .success)
                }
            }
        }
    }

    // MARK: - Shell execution

    private func runCommand(_ executable: String, args: [String],
                           cwd: String? = nil, silent: Bool = false,
                           streamOutput: Bool = false,
                           completion: @escaping (Int32, String) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: executable)
            task.arguments = args

            if let cwd = cwd {
                task.currentDirectoryURL = URL(fileURLWithPath: cwd)
            }

            // Inherit PATH so docker is findable
            var env = ProcessInfo.processInfo.environment
            let extraPaths = "/usr/local/bin:/opt/homebrew/bin:/usr/bin"
            env["PATH"] = extraPaths + ":" + (env["PATH"] ?? "")
            task.environment = env

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            task.standardOutput = stdoutPipe
            task.standardError = stderrPipe

            var allOutput = ""

            if streamOutput {
                stderrPipe.fileHandleForReading.readabilityHandler = { handle in
                    let data = handle.availableData
                    guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
                    allOutput += line
                    if !silent {
                        for l in line.components(separatedBy: "\n") where !l.trimmingCharacters(in: .whitespaces).isEmpty {
                            let trimmed = String(l.prefix(80))
                            DispatchQueue.main.async {
                                self.log(trimmed, type: .output)
                            }
                        }
                    }
                }
                stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
                    let data = handle.availableData
                    guard !data.isEmpty, let line = String(data: data, encoding: .utf8) else { return }
                    allOutput += line
                    if !silent {
                        for l in line.components(separatedBy: "\n") where !l.trimmingCharacters(in: .whitespaces).isEmpty {
                            let trimmed = String(l.prefix(80))
                            DispatchQueue.main.async {
                                self.log(trimmed, type: .output)
                            }
                        }
                    }
                }
            }

            do {
                try task.run()
                task.waitUntilExit()

                if !streamOutput {
                    let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                    let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                    allOutput = (String(data: stdoutData, encoding: .utf8) ?? "")
                        + (String(data: stderrData, encoding: .utf8) ?? "")
                }

                stdoutPipe.fileHandleForReading.readabilityHandler = nil
                stderrPipe.fileHandleForReading.readabilityHandler = nil

                DispatchQueue.main.async {
                    completion(task.terminationStatus, allOutput)
                }
            } catch {
                DispatchQueue.main.async {
                    self.log("Falha ao executar: \(error.localizedDescription)", type: .error)
                    completion(1, error.localizedDescription)
                }
            }
        }
    }
}

// MARK: - Button Style
struct ActionButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: 7)
                    .fill(color.opacity(configuration.isPressed ? 0.18 : 0.1))
            )
            .foregroundColor(color)
            .overlay(
                RoundedRectangle(cornerRadius: 7)
                    .stroke(color.opacity(0.15), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.12), value: configuration.isPressed)
    }
}
