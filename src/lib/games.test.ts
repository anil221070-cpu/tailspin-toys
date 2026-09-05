import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { asc } from 'drizzle-orm';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllGameIds,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('filters games by one or more categories', async () => {
        await seedGames(db, 3);
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle' })
            .returning({ id: categories.id });
        const [publisher] = await db
            .select({ id: publishers.id })
            .from(publishers);
        await db.insert(games).values({
            title: 'Puzzle Game',
            description: 'Puzzle description',
            starRating: 4,
            categoryId: puzzle.id,
            publisherId: publisher.id,
        });

        const filtered = await getAllGames(db, { categoryIds: [puzzle.id] });
        expect(filtered.map((game) => game.title)).toEqual(['Puzzle Game']);
    });

    it('filters games by publisher', async () => {
        await seedGames(db, 2);
        const [secondPublisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'pub' })
            .returning({ id: publishers.id });
        const [category] = await db
            .select({ id: categories.id })
            .from(categories);
        await db.insert(games).values({
            title: 'Other Publisher Game',
            description: 'Description',
            starRating: 4,
            categoryId: category.id,
            publisherId: secondPublisher.id,
        });

        const filtered = await getAllGames(db, { publisherId: secondPublisher.id });
        expect(filtered.map((game) => game.title)).toEqual(['Other Publisher Game']);
    });

    it('combines category and publisher filters', async () => {
        await seedGames(db, 1);
        const [secondCategory] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle' })
            .returning({ id: categories.id });
        const [firstCategory] = await db
            .select({ id: categories.id })
            .from(categories)
            .orderBy(asc(categories.id))
            .limit(1);
        const [secondPublisher] = await db
            .insert(publishers)
            .values({ name: 'Pub Two', description: 'pub' })
            .returning({ id: publishers.id });
        await db.insert(games).values([
            {
                title: 'Matching Game',
                description: 'Description',
                starRating: 4,
                categoryId: secondCategory.id,
                publisherId: secondPublisher.id,
            },
            {
                title: 'Wrong Category',
                description: 'Description',
                starRating: 4,
                categoryId: firstCategory.id,
                publisherId: secondPublisher.id,
            },
        ]);

        const filtered = await getAllGames(db, {
            categoryIds: [secondCategory.id],
            publisherId: secondPublisher.id,
        });
        expect(filtered.map((game) => game.title)).toEqual(['Matching Game']);
    });

    it('returns no games when filters do not match', async () => {
        await seedGames(db, 2);
        const filtered = await getAllGames(db, { categoryIds: [99999], publisherId: 99999 });
        expect(filtered).toEqual([]);
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });
});
