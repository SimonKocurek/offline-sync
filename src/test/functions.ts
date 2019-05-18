import { clone, timeSince, isEmpty } from '../util/functions';
import { expect } from 'chai';

describe('clone', () => {
    it('can clone arrays', () => {
        // given
        let array = [1, 2, {1: '12'}, 'test'];

        // when
        let cloned = clone(array) as any[];
        array.push(1);

        // then
        expect(array.length).equal(cloned.length + 1);
    });

    it('can clone objects', () => {
        // given
        let obj = {
            1: 1,
            2: 2,
            3: {1: '12'},
            'test': [1]
        };

        // when
        let cloned = clone(obj);

        // then
        expect(obj).deep.equal(cloned);
    });

    it('does deep clone', () => {
        // given
        let obj = {
            1: 1,
            2: 2,
            3: {1: '12'},
            'test': [1]
        };

        // when
        let cloned = clone(obj) as {[key: number]: string};
        delete obj[3][1];

        // then
        let value = cloned[3] as {[key: number]: string};
        expect(value[1]).to.equal('12');
    });
});

describe('timeSince', () => {
    it('works on earlier times', () => {
        // given
        let currentTime = Date.now();
        let futureTime = currentTime + 1_000_000; // 1000 seconds

        // when
        let result = timeSince(futureTime);

        // then
        expect(result).not.above(0); // negative
    });

    it('compares to current time', () => {
        // given
        let currentTime = Date.now();

        // when
        let result = timeSince(currentTime);

        // then
        expect(result).not.above(1000); // not 1 second has passed
    });
});

describe('isEmpty', () => {
    it('works on objects', () => {
        expect(isEmpty({})).to.be.true;
        expect(isEmpty({'test': 12})).to.be.false;
    });

    it('works on nulls', () => {
        expect(isEmpty(null)).to.be.true;
    });

    it('works on arrays', () => {
        expect(isEmpty([])).to.be.true;
        expect(isEmpty([1])).to.be.false;
    });
});
