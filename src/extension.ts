import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerTextEditorCommand('markdown.extension.mdContinueList', (textEditor, edit) => {
        // Get current line
        let cursorPosition = textEditor.selection.active;
        let line = textEditor.document.lineAt(cursorPosition.line);
        let textBeforeCursor = line.text.substring(0, cursorPosition.character);
        let textAfterCursor = line.text.substring(cursorPosition.character);

        let lineBreakPosition = cursorPosition;

        // If it's an empty list item, remove it
        
        if (
            /^([-+*]|[0-9]+[.)])( +\[[ x]\])?$/.test(textBeforeCursor.trim())  // It is a (task) list item
            && textAfterCursor.trim().length == 0                              // It is empty
        ) {
            if (/^\s+([-+*]|[0-9]+[.)]) +(\[[ x]\] )?$/.test(textBeforeCursor)) {
                // It is not a top-level list item, outdent it
                return vscode.commands.executeCommand('editor.action.outdentLines').then;
            } else if (/^([-+*]|[0-9]+[.)]) $/.test(textBeforeCursor)) {
                // It is a general list item, delete the list marker
                let range = new vscode.Range(cursorPosition.with({ character: 0 }), cursorPosition);
                return edit.delete(range);
            } else if (/^([-+*]|[0-9]+[.)]) +(\[[ x]\] )$/.test(textBeforeCursor)) {
                // It is a task list item, delete the checkbox
                let range = new vscode.Range(cursorPosition.with({ character: textBeforeCursor.length - 4 }), cursorPosition);
                return edit.delete(range);
            } else {
                return edit.insert(textEditor.selection.active, '\n');
            }
        }

        let matches: RegExpExecArray | null;
        let fixCursorPosition: boolean;
        if (/^> /.test(textBeforeCursor)) {
            // Block quotes

            // Case 1: ending a blockquote if:
            const isEmptyArrowLine = line.text.replace(/[ \t]+$/, '') === '>';
            if (isEmptyArrowLine) {
                if (cursorPosition.line === 0) {
                    // it is an empty '>' line and also the first line of the document
                    let range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(cursorPosition.line, cursorPosition.character));
                    return textEditor.edit(editorBuilder => {
                        editorBuilder.replace(range, '');
                    }).then(() => { textEditor.revealRange(textEditor.selection) });
                } else {
                    // there have been 2 consecutive empty `>` lines
                    const prevLineText = textEditor.document.lineAt(cursorPosition.line - 1).text;
                    if (prevLineText.replace(/[ \t]+$/, '') === '>') {
                        let range = new vscode.Range(new vscode.Position(cursorPosition.line - 1, 0), new vscode.Position(cursorPosition.line, cursorPosition.character));
                        return textEditor.edit(editorBuilder => {
                            editorBuilder.replace(range, '\n');
                        }).then(() => { textEditor.revealRange(textEditor.selection) });
                    }
                }
            }

            // Case 2: `>` continuation
            return textEditor.edit(editBuilder => {
                if (isEmptyArrowLine) {
                    const startPosition = new vscode.Position(cursorPosition.line, line.text.trim().length);
                    editBuilder.delete(new vscode.Range(startPosition, line.range.end));
                    lineBreakPosition = startPosition;
                }
                editBuilder.insert(lineBreakPosition, `\n> `);
            }).then(() => { textEditor.revealRange(textEditor.selection) });
        } else if ((matches = /^((\s*[-+*] +)(\[[ x]\] +)?)/.exec(textBeforeCursor)) !== null) {
            // satisfy compiler's null check
            const match0 = matches[0];
            const match1 = matches[1];
            const match2 = matches[2];
            const match3 = matches[3];


            // Unordered list
            return textEditor.edit(editBuilder => {
                if (
                    match3 &&                       // If it is a task list item and
                    match0 === textBeforeCursor     // the cursor is right after the checkbox "- [x] |item1"
                ) {
                    // Move the task list item to the next line
                    // - [x] |item1
                    // ↓
                    // - [ ]
                    // - [x] |item1
                    let range = new vscode.Range(cursorPosition.line, match2.length + 1, cursorPosition.line, match2.length + 2);
                    editBuilder.replace(range, " ");
                    editBuilder.insert(lineBreakPosition, `\n${match1}`);
                    fixCursorPosition = true;
                } else {
                    // Insert "- [ ]"
                    // - [ ] item1|
                    // ↓
                    // - [ ] item1
                    // - [ ] |
                    editBuilder.insert(lineBreakPosition, `\n${match1.replace('[x]', '[ ]')}`);
                    if (cursorPosition.character === matches![0].length) {
                        fixCursorPosition = true;
                    }
                }
            }).then(() => {
                // Fix cursor position
                // - [ ]
                // - [x] |item1
                // ↓
                // - [ ] |
                // - [x] item1
                if (fixCursorPosition) {
                    let newCursorPos = cursorPosition.with(line.lineNumber, matches![1].length);
                    textEditor.selection = new vscode.Selection(newCursorPos, newCursorPos);
                }
            }).then(() => { textEditor.revealRange(textEditor.selection) });
        } else if ((matches = /^(\s*)([0-9]+)([.)])( +)((\[[ x]\] +)?)/.exec(textBeforeCursor)) !== null) {

            // Numbered list
            let config = vscode.workspace.getConfiguration('markdown.extension.numberedList').get<Boolean>('marker');
            let leadingSpace = matches[1];
            let previousMarker = matches[2];
            const marker = config ? String(Number(previousMarker) + 1) : '1';
            let delimiter = matches[3];
            let trailingSpace = matches[4];
            let gfmCheckbox = matches[5].replace('[x]', '[ ]');
            let textIndent = (previousMarker + delimiter + trailingSpace).length;
            // Add enough trailing spaces so that the text is aligned with the previous list item, but always keep at least one space
            trailingSpace = " ".repeat(Math.max(1, textIndent - (marker + delimiter).length));

            const toBeAdded = leadingSpace + marker + delimiter + trailingSpace + gfmCheckbox;
            return textEditor.edit(
                editBuilder => {
                    editBuilder.insert(lineBreakPosition, `\n${toBeAdded}`);
                },
                { undoStopBefore: true, undoStopAfter: false }
            ).then(() => {
                // Fix cursor position
                // 1. |item
                // ↓
                // 1. |
                // 2. item
                if (cursorPosition.character === matches![0].length) {
                    let newCursorPos = cursorPosition.with(line.lineNumber, toBeAdded.length);
                    textEditor.selection = new vscode.Selection(newCursorPos, newCursorPos);
                }
            }).then(() => { textEditor.revealRange(textEditor.selection); });
        } else {
            return edit.insert(textEditor.selection.active, '\n');
        }

    });

    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
