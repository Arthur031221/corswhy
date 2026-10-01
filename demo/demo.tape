Output assets/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1080
Set Height 640
Set Padding 20
Set TypingSpeed 10ms
Set Theme "Catppuccin Mocha"

Hide
Type "unset NO_COLOR; export PS1='$ ' FORCE_COLOR=1; clear; node bin/corswhy.js http://127.0.0.1:18765/auth --origin http://localhost:5173 --method POST --header authorization,content-type" Enter
Sleep 1s
Show
Sleep 5s
Type "node bin/corswhy.js http://127.0.0.1:18765/ok --origin http://localhost:5173 --method POST --header authorization,content-type" Enter
Sleep 5s
