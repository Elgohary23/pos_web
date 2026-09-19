; ============================================================
;  KasabiPOS Windows installer / uninstaller
;  Build via package\build.ps1 (passes APP_VER + APP_PORT)
;  Requires NSIS 3 (unicode) and staged files in build\stage
;  NOTE: file starts with a UTF-8 BOM so Arabic strings are
;  parsed correctly on any system codepage.
; ============================================================

Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef APP_NAME
  !define APP_NAME "KasabiPOS"
!endif
!ifndef APP_VER
  !define APP_VER "1.0.0"
!endif
!ifndef APP_PORT
  !define APP_PORT "3000"
!endif
!ifndef APP_DISPLAY
  !define APP_DISPLAY "نظام الكاشير"
!endif

Name "${APP_DISPLAY} (${APP_NAME})"
OutFile "dist\KasabiPOS-Setup-${APP_VER}.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!define MUI_ICON "build\stage\app.ico"
!define MUI_UNICON "build\stage\app.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "http://localhost:${APP_PORT}"
!define MUI_FINISHPAGE_RUN_TEXT "فتح ${APP_DISPLAY} في المتصفح"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Arabic"

Section "Install"
  ; Upgrade path: stop + remove a previously installed service first
  ; so its files are unlocked before we copy new ones.
  IfFileExists "$INSTDIR\provision.js" 0 +3
    nsExec::Exec '"$INSTDIR\runtime\node.exe" "$INSTDIR\provision.js" stop "$INSTDIR"'
    Pop $0

  SetOutPath "$INSTDIR\runtime"
  File /r "build\stage\runtime\*"

  SetOutPath "$INSTDIR\server"
  File /r "build\stage\server\*"

  SetOutPath "$INSTDIR\client"
  File /r "build\stage\client\*"

  SetOutPath "$INSTDIR\tools"
  File "build\stage\tools\nssm.exe"

  SetOutPath "$INSTDIR"
  File "build\stage\provision.js"
  File "build\stage\app.ico"

  ; Create the auto-start Windows service + inbound firewall rule
  nsExec::Exec '"$INSTDIR\runtime\node.exe" "$INSTDIR\provision.js" install "$INSTDIR" "${APP_PORT}"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "تعذّر إنشاء خدمة ${APP_DISPLAY} كخدمة ويندوز.$\r$\nالرمز: $0$\r$\nراجع مجلد program files لسجل التشغيل."
    Abort
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add/Remove Programs entry
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName" "${APP_DISPLAY}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion" "${APP_VER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher" "KasabiPOS"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "URLInfoAbout" "http://localhost:${APP_PORT}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoRepair" 1

  ; Start Menu + Desktop shortcuts (open the app in the default browser)
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  WriteINIStr "$SMPROGRAMS\${APP_NAME}\${APP_DISPLAY}.url" \
    "InternetShortcut" "URL" "http://localhost:${APP_PORT}"
  WriteINIStr "$SMPROGRAMS\${APP_NAME}\${APP_DISPLAY}.url" \
    "InternetShortcut" "IconFile" "$INSTDIR\app.ico"
  WriteINIStr "$SMPROGRAMS\${APP_NAME}\${APP_DISPLAY}.url" \
    "InternetShortcut" "IconIndex" "0"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\إلغاء التثبيت.lnk" "$INSTDIR\Uninstall.exe"
  WriteINIStr "$DESKTOP\${APP_DISPLAY}.url" \
    "InternetShortcut" "URL" "http://localhost:${APP_PORT}"
  WriteINIStr "$DESKTOP\${APP_DISPLAY}.url" \
    "InternetShortcut" "IconFile" "$INSTDIR\app.ico"
  WriteINIStr "$DESKTOP\${APP_DISPLAY}.url" \
    "InternetShortcut" "IconIndex" "0"
SectionEnd

Section "Uninstall"
  ; Stop + remove the service and delete the firewall rule
  IfFileExists "$INSTDIR\provision.js" 0 +3
    nsExec::Exec '"$INSTDIR\runtime\node.exe" "$INSTDIR\provision.js" uninstall "$INSTDIR"'
    Pop $0

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_DISPLAY}.url"
  Delete "$SMPROGRAMS\${APP_NAME}\إلغاء التثبيت.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_DISPLAY}.url"

  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

  ; Wipe the entire installation (app, data, logs, service leftovers)
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd