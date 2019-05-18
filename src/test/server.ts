
import { expect } from 'chai';

describe('Stack', () => {
    it('can be initialized without an initializer', () => {
        const s: number[] = [];
        expect(s.length).to.equal(0);
    });
});

