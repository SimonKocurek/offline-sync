import { Document } from '../types/document';
import Edit from '../types/edit';
import { removeConfirmedEdits, checkVersionNumbers, applyEdit, createSyncMessage } from '../util/synchronize';
import { expect } from 'chai';
import { DiffPatcher } from 'jsondiffpatch';

describe('removeConfirmedEdits', () => {
    it('only removes confirmed edits', () => {
        // given
        let edits = [
            new Edit(0, {}),
            new Edit(1, {}),
            new Edit(2, {}),
            new Edit(3, {}),
        ];

        // when
        removeConfirmedEdits(2, edits);

        // then
        expect(edits.length).to.equal(2);
    });
});

describe('checkVersionNumbers', () => {
    it('does nothing on no edits received', () => {
        // given
        let doc = new Document('', '', {});
        doc.localVersion = 2;
        doc.backupVersion = 1
        doc.edits = []

        // when
        checkVersionNumbers(2, doc); // error not thrown

        // then
        expect(doc.localVersion).to.equal(2); // backup not performed
    });

    it('does something only on version missmatch', () => {
        // given
        let doc = new Document('', '', {});
        doc.localVersion = 2;
        doc.backupVersion = 1
        doc.remoteVersion = 0
        doc.edits = [new Edit(0, {})]

        // when
        checkVersionNumbers(2, doc); // error not thrown

        // then
        expect(doc.localVersion).to.equal(2); // backup not performed
    });

    it('throws error on backup version missmatch', () => {
        // given
        let doc = new Document('', '', {});
        doc.localVersion = 2;
        doc.backupVersion = 1;
        doc.remoteVersion = 0
        doc.edits = [new Edit(0, {})]

        // when
        let action = () => checkVersionNumbers(0, doc);

        // then
        expect(action).to.throw(Error);
    });

    it('performs rollback on valid backup verison', () => {
        // given
        let doc = new Document('', '', {});
        doc.localVersion = 2;
        doc.backupVersion = 1;
        doc.edits = [new Edit(0, {})]

        // when
        checkVersionNumbers(1, doc);

        // then
        expect(doc.localVersion).to.equal(doc.backupVersion);
        expect(doc.edits.length).to.equal(0);
    });
});

describe('applyEdit', () => {
    it('skips already applied edits', () => {
        // given
        let doc = new Document('', '', {});
        doc.localVersion = 2;
        doc.remoteVersion = 2;
        doc.backupVersion = 1;
        doc.edits = [new Edit(0, {})]

        let edit = new Edit(1, {});

        // when
        applyEdit(doc.localCopy || {}, doc, edit, new DiffPatcher());

        // then
        expect(doc.backupVersion).not.equal(doc.remoteVersion); // nothing happens
        expect(doc.remoteVersion).not.equal(edit.basedOnVersion);
    });

    it('throws error on bad edit version', () => {
        // given
        let doc = new Document('', '', {});
        doc.localVersion = 2;
        doc.remoteVersion = 1;
        doc.backupVersion = 1;
        doc.edits = [new Edit(0, {})]

        let edit = new Edit(2, {});

        // when
        let action = () => applyEdit(doc.localCopy || {}, doc, edit, new DiffPatcher());

        // then
        expect(action).to.throw(Error);
    });

    it('updates data with edit', () => {
        // given
        let doc = new Document('', '', ["test"]);
        doc.localVersion = 2;
        doc.remoteVersion = 1;
        doc.backupVersion = 1;

        doc.localCopy = ["test!"];
        doc.shadow = ["test!"];
        // ["test"] -> ["test!"]
        doc.edits = [new Edit(1, {
            "0": [
              "test!"
            ],
            "_t": "a",
            "_0": [
              "test",
              0,
              0
            ]
          })
        ];

        // ["test"] -> ["test", "new"]
        let edit = new Edit(1, {
            "1": [
                "new"
            ],
            "_t": "a"
        });

        // when
        applyEdit(doc.localCopy, doc, edit, new DiffPatcher());

        // then
        expect(doc.shadow).deep.equal(["test!", "new"]);
        expect(doc.localCopy).deep.equal(["test!", "new"]);
        // We now have version higher than the one based on
        expect(doc.remoteVersion).to.be.equal(edit.basedOnVersion + 1);
    });

    it('performs backup', () => {
        // given
        let doc = new Document('', '', ["test"]);
        doc.localVersion = 2;
        doc.remoteVersion = 1;
        doc.backupVersion = 1;

        doc.localCopy = ["test!"];
        doc.shadow = ["test!"];
        // ["test"] -> ["test!"]
        doc.edits = [new Edit(1, {
            "0": [
              "test!"
            ],
            "_t": "a",
            "_0": [
              "test",
              0,
              0
            ]
          })
        ];

        // ["test"] -> ["test", "new"]
        let edit = new Edit(1, {
            "1": [
                "new"
            ],
            "_t": "a"
        });

        // when
        applyEdit(doc.localCopy, doc, edit, new DiffPatcher());

        // then
        expect(doc.backupVersion).to.be.equal(doc.remoteVersion);
        expect(doc.backup).deep.equal(doc.shadow);
    });
});

describe('createSyncMessage', () => {
    it('creates message with all edits', () => {
        let document = new Document('', '', {});
        document.localCopy = {"newKey": "test"};
        document.localVersion = 1;
        document.edits = [
            new Edit(0, {})
        ]

        // when
        let message = createSyncMessage(document.localCopy, document, new DiffPatcher());

        // then
        expect(message.edits).deep.equal(document.edits);

        expect(document.edits.length).to.be.equal(2);
        expect(document.localVersion).to.be.equal(2);
    });

    it('does not add edit and increment version on empty diff', () => {
        // given
        let document = new Document('', '', {});
        document.localVersion = 1;
        document.edits = [
            new Edit(0, {})
        ]

        // when
        let message = createSyncMessage(document.localCopy || {}, document, new DiffPatcher());

        // then
        expect(message.edits).deep.equal(document.edits);
        expect(document.edits.length).to.be.equal(1); // no edits added
        expect(document.localVersion).to.be.equal(1); // has not updated
    });
});
