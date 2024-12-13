import { strict as assert } from "assert";
import * as path from "path";
import * as vscode from 'vscode';
import { Selection } from "vscode";

//#region Constant

export const Test_Workspace_Path = vscode.Uri.file(path.resolve(__dirname, "..", "..", "test"));
export const Test_Md_File_Path = vscode.Uri.joinPath(Test_Workspace_Path, "test.md");

//#endregion Constant

//#region Utility

/**
 * Opens a document with the corresponding editor.
 * @param file A Uri or file system path which identifies the resource.
 */
export const openDocument = async (file: vscode.Uri): Promise<readonly [vscode.TextDocument, vscode.TextEditor]> => {
	const document = await vscode.workspace.openTextDocument(file);
	const editor = await vscode.window.showTextDocument(document);
	return [document, editor];
};

/**
 * Pauses for a while.
 * @param ms - Time to pause in millisecond.
 * @example
 * await sleep(1000);
 */
export function sleep(ms: number): Promise<void> {
	return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Tests a command.
 */
export async function testCommand(
	command: string,
	initLines: readonly string[],
	initSelection: vscode.Selection,
	expectedLines: readonly string[],
	expectedSelection: vscode.Selection
): Promise<void> {

	// Open the file.
	const [document, editor] = await openDocument(Test_Md_File_Path);

	// Place the initial content.
	await editor.edit(editBuilder => {
		const fullRange = new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length));
		editBuilder.delete(fullRange);
		editBuilder.insert(new vscode.Position(0, 0), initLines.join("\n"));
	});
	editor.selection = initSelection;

	await sleep(50);

	// Run the command.
	await vscode.commands.executeCommand(command);

	await sleep(100);

	// Assert.
	const actual = document.getText()
		.replace(/\r\n/g, "\n"); // Normalize line endings.

	// Сравниваем полученный текст с ожидаемым
	assert.deepStrictEqual(actual, expectedLines.join("\n"), `Expected:\n${expectedLines.join("\n")}\nActual:\n${actual}`);

	// Сравниваем положение курсора с ожидаемым
	assert.deepStrictEqual(editor.selection, expectedSelection, `Expected cursor position: ${expectedSelection}, Actual position: ${editor.selection}`);
}

suite("List editing.", () => {

	test("Enter key. Continue list item. '- item1|'", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'- item1'
			],
			new Selection(0, 7, 0, 7),
			[
				'- item1',
				'- '
			],
			new Selection(1, 2, 1, 2));
	});

	test("Enter key. Continue list item. '- |item1'", () => {
		const cursorPosition = new Selection(0, 2, 0, 2);
		return testCommand('markdown.extension.mdContinueList',
			[
				'- item1'
			],
			cursorPosition,
			[
				'- ',
				'- item1'
			],
			cursorPosition);
	});

	test("Enter key. Don't continue empty list item", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'- item1',
				'- '
			],
			new Selection(1, 2, 1, 2),
			[
				'- item1',
				'',
			],
			new Selection(1, 0, 1, 0));
	});

	test("Enter key. Outdent empty list item until it is top-level", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'- item1',
				'  - '
			],
			new Selection(1, 6, 1, 6),
			[
				'- item1',
				'- '
			],
			new Selection(1, 2, 1, 2));
	});

	test("Enter key. List marker `*`", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'* item1'],
			new Selection(0, 7, 0, 7),
			[
				'* item1',
				'* '
			],
			new Selection(1, 2, 1, 2));
	});

	test("Enter key. Continue GFM checkbox item. '- [ ] item1|'", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'- [ ] item1'
			],
			new Selection(0, 11, 0, 11),
			[
				'- [ ] item1',
				'- [ ] '
			],
			new Selection(1, 6, 1, 6));
	});

	test("Enter key. Continue GFM checkbox item. '- [x] |item1'", () => {
		const cursorPosition = new Selection(0, 6, 0, 6);
		return testCommand('markdown.extension.mdContinueList',
			[
				'- [x] item1'
			],
			cursorPosition,
			[
				'- [ ] ',
				'- [x] item1'
			],
			cursorPosition);
	});

	if (vscode.workspace.getConfiguration('markdown.extension.numberedList').get<Boolean>('marker')) {
		test("Enter key. Keep list item text indentation. '1.  item1|'", () => {
			return testCommand('markdown.extension.mdContinueList',
				[
					'1.  item1'
				],
				new Selection(0, 9, 0, 9),
				[
					'1.  item1',
					'2.  '
				],
				new Selection(1, 4, 1, 4));
		});


		test("Enter key. Keep list item text indentation. '9.  item9|'", () => {
			return testCommand('markdown.extension.mdContinueList',
				[
					'9.  item9'
				],
				new Selection(0, 9, 0, 9),
				[
					'9.  item9',
					'10. '
				],
				new Selection(1, 4, 1, 4));
		});
	} else {
		test("Enter key. Keep list item text indentation. '1.  item1|'", () => {
			return testCommand('markdown.extension.mdContinueList',
				[
					'1.  item1'
				],
				new Selection(0, 9, 0, 9),
				[
					'1.  item1',
					'1.  '
				],
				new Selection(1, 4, 1, 4));
		});
	}


	test("Enter key. '- [test]|'. #122", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'- [test]'
			],
			new Selection(0, 8, 0, 8),
			[
				'- [test]',
				'- '
			],
			new Selection(1, 2, 1, 2));
	});

	test("Enter key. '> |'", () => {
		return testCommand('markdown.extension.mdContinueList',
			[
				'> test'
			],
			new Selection(0, 6, 0, 6),
			[
				'> test',
				'> '
			],
			new Selection(1, 2, 1, 2));
	});
});
