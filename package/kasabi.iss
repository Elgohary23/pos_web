; ============================================================
;  KasabiPOS - Inno Setup installer
;
;  Compiled by package\build.ps1, which stages the payload into
;  package\build\stage and passes the defines on the ISCC line:
;
;      ISCC /DAPP_VER=1.0.0 /DAPP_PORT=3000 package\kasabi.iss
;
;  Install layout (all under {app}, default C:\Program Files\KasabiPOS):
;
;      runtime\node.exe     embedded Node runtime
;      server\              Express API + production node_modules
;      client\              built React SPA, served by Express
;      service\             WinSW wrapper (from node-windows) + its XML
;      data\                kasabi.sqlite + sessions.sqlite   <- persistent
;      logs\                service stdout/stderr
;      kasabi.json          port + session secret             <- persistent
;      app.ico
;
;  data\ and kasabi.json are deliberately NOT listed in [Files]: Inno Setup
;  only overwrites what it ships, so running a newer setup over an older one
;  (same AppId) keeps the database, the sessions and the configured port.
;  They are also excluded from [UninstallDelete], so uninstalling and then
;  reinstalling restores the shop's data.
; ============================================================

#ifndef APP_VER
  #define APP_VER "1.0.0"
#endif
#ifndef APP_PORT
  #define APP_PORT "3000"
#endif
#ifndef APP_PUBLISHER
  #define APP_PUBLISHER "KasabiPOS"
#endif

#define APP_NAME     "KasabiPOS"
#define APP_DISPLAY  "نظام الكاشير"
#define APP_EXE      "node.exe"
#define APP_ICON     "app.ico"

[Setup]
AppId={{6E1C9A4B-3D57-4B8E-9F21-7A2C4D5E8B10}
AppName={#APP_DISPLAY}
AppVersion={#APP_VER}
AppVerName={#APP_DISPLAY} {#APP_VER}
AppPublisher={#APP_PUBLISHER}
AppComments={#APP_DISPLAY} - نظام نقاط البيع يعمل تلقائياً كخدمة ويندوز على هذا الجهاز
VersionInfoVersion={#APP_VER}
DefaultDirName={autopf}\{#APP_NAME}
DefaultGroupName={#APP_DISPLAY}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#APP_ICON}
UninstallDisplayName={#APP_DISPLAY}
SetupIconFile=build\stage\{#APP_ICON}
WizardStyle=modern
MinVersion=10.0
; The service wrapper and better-sqlite3 are win32-x64, so build and install as
; a 64-bit app. Without this {autopf} resolves to Program Files (x86).
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Creating a Windows service and an inbound firewall rule both require
; elevation, so the whole setup runs elevated with no exceptions.
PrivilegesRequired=admin
OutputDir=dist
OutputBaseFilename=KasabiPOS-Setup-{#APP_VER}
Compression=lzma2/max
SolidCompression=yes
ShowLanguageDialog=no
CloseApplications=no
RestartApplications=no

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[CustomMessages]
arabic.WelcomeLabel2=نظام كاشير ومبيعات يعمل تلقائياً كخدمة ويندوز على هذا الجهاز، ويمكن فتحه من الموبايل عبر شبكة الواي فاي. البيانات محفوظة داخل مجلد data ولا تُمسح عند التحديث.

[Tasks]
; The Start Menu folder is mandatory (requirement: icon + uninstall inside it),
; so it is always created by provision.js. The desktop icon is optional.
Name: "desktopicon"; Description: "إنشاء اختصار على سطح المكتب"; GroupDescription: "اختصارات:"

[Files]
; --- Node runtime ------------------------------------------------------
Source: "build\stage\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs

; --- Express API + its production dependencies -------------------------
Source: "build\stage\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs

; --- Built React SPA ---------------------------------------------------
Source: "build\stage\client\*"; DestDir: "{app}\client"; Flags: ignoreversion recursesubdirs createallsubdirs

; --- Windows service wrapper + provisioning script ---------------------
; provision.js sits beside its node_modules so its `require` calls resolve
; identically here and in the installed tree.
Source: "build\stage\service\*"; DestDir: "{app}\service"; Flags: ignoreversion recursesubdirs createallsubdirs

; --- Icon --------------------------------------------------------------
Source: "build\stage\{#APP_ICON}"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; Leftovers from the previous NSIS-based installer, plus stale hashed Vite
; bundles so repeated updates never accumulate dead assets.
Type: filesandordirs; Name: "{app}\tools"
Type: filesandordirs; Name: "{app}\client\assets"
Type: files; Name: "{app}\client\placeholder.png"

[Dirs]
; Created before the service first runs so a LocalSystem process can write.
Name: "{app}\data"
Name: "{app}\logs"

[Icons]
; provision.js writes the app + phone shortcuts into this same Start Menu
; folder using our own icon, so only the canonical uninstaller entry is
; created here.
Name: "{group}\{#APP_DISPLAY} - إلغاء التثبيت"; Filename: "{app}\unins000.exe"; WorkingDir: "{app}"; IconFilename: "{app}\{#APP_ICON}"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\server"
Type: filesandordirs; Name: "{app}\client"
Type: filesandordirs; Name: "{app}\service"
Type: filesandordirs; Name: "{app}\tools"
Type: files; Name: "{app}\app.ico"

; data\, logs\ and kasabi.json stay on disk so a reinstall is non-destructive.

[Code]
var
  ProvisionFailed: Boolean;
  ProvisionCode: Integer;

{ Stop and remove the service BEFORE any file is copied, otherwise the
  previously installed node.exe keeps its files locked and the copy dies
  halfway. ssInstall fires before [Files]. }
procedure StopRunningService;
var
  ResultCode: Integer;
  NodeExe: String;
  Provision: String;
begin
  NodeExe := ExpandConstant('{app}\runtime\node.exe');
  Provision := ExpandConstant('{app}\service\provision.js');
  if (FileExists(NodeExe) and FileExists(Provision)) then
    Exec(NodeExe, '"' + Provision + '" stop "' + ExpandConstant('{app}') + '"', '',
      SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

{ Drive provision.js. Returns the process exit code (0 = success). }
function RunProvision(Action, Params: String): Integer;
var
  ResultCode: Integer;
  NodeExe: String;
  Provision: String;
begin
  Result := 0;
  NodeExe := ExpandConstant('{app}\runtime\node.exe');
  Provision := ExpandConstant('{app}\service\provision.js');
  if not FileExists(NodeExe) then
  begin
    Result := 1;
    Exit;
  end;
  Exec(NodeExe, '"' + Provision + '" ' + Action + ' "' + ExpandConstant('{app}') + '"' +
    Params, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := ResultCode;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  IconArgs: String;
begin
  case CurStep of
    ssInstall:
      StopRunningService;
    ssPostInstall:
      begin
        { 1 = desktop shortcut, 0 = none. The Start Menu folder always gets
          the app + phone shortcuts because the folder is required anyway. }
        if WizardIsTaskSelected('desktopicon') then
          IconArgs := ' 1'
        else
          IconArgs := ' 0';
        ProvisionCode := RunProvision('install', ' {#APP_PORT}' + IconArgs);
        ProvisionFailed := ProvisionCode <> 0;
        if ProvisionFailed then
          MsgBox('تم تثبيت الملفات، لكن تعذّر تشغيل خدمة ويندوز.' + #13#10 + #13#10 +
            'جرّب إعادة التثبيت بصلاحيات Administrator.' + #13#10 +
            'سجل الخدمة: ' + ExpandConstant('{app}\logs') + #13#10 +
            'رمز الخطأ: ' + IntToStr(ProvisionCode), mbError, MB_OK);
      end;
  end;
end;

function InitializeUninstall: Boolean;
begin
  { Everything must happen here rather than in CurUninstallStepChanged: by
    usPostUninstall Inno has already deleted the service folder, and with it
    provision.js and the embedded node.exe, so no runtime is left to run the
    cleanup with. Doing it up-front releases the service file locks before the
    first delete and still leaves us able to drop the firewall rule + links. }
  StopRunningService;
  RunProvision('uninstall', '');
  Result := True;
end;
