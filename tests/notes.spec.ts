import { test, expect, createNoteViaApi } from './fixtures';

test.describe('Notes', () => {
    test('shows an empty state for a fresh user', async ({
        authedPage: page,
    }) => {
        await page.goto('/notes');

        await expect(page.getByText('No notes yet')).toBeVisible();
    });

    test('creates a note via the dialog with a toast', async ({
        authedPage: page,
    }) => {
        await page.goto('/notes');

        await page.getByRole('button', { name: 'New Note' }).first().click();
        await page.getByPlaceholder('Note title').fill('Grocery list');
        await page
            .getByPlaceholder('Write something worth remembering')
            .fill('Eggs, milk, hot sauce');
        await page.getByRole('button', { name: 'Create note' }).click();

        await expect(page.getByRole('status')).toContainText('Note created');
        await expect(
            page.getByRole('heading', { name: 'Grocery list' }),
        ).toBeVisible();
    });

    test('searches notes by keyword', async ({ authedPage: page }) => {
        await createNoteViaApi(page.context(), {
            title: 'Travel plans',
            content: 'Fly to Tokyo in spring',
        });
        await createNoteViaApi(page.context(), {
            title: 'Recipe',
            content: 'Smoked brisket rub',
        });

        await page.goto('/notes');
        await page.getByLabel('Search notes').fill('brisket');
        await page.getByRole('button', { name: 'Search' }).click();

        await expect(
            page.getByRole('heading', { name: 'Recipe' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Travel plans' }),
        ).toHaveCount(0);
    });

    test('shows a no-results empty state for a search without matches', async ({
        authedPage: page,
    }) => {
        await createNoteViaApi(page.context(), {
            title: 'Only note',
            content: 'Nothing about that topic',
        });

        await page.goto('/notes?q=quantum');

        await expect(
            page.getByText('No notes match your search'),
        ).toBeVisible();
    });

    test('edits a note', async ({ authedPage: page }) => {
        await createNoteViaApi(page.context(), {
            title: 'Draft title',
            content: 'Draft content',
        });

        await page.goto('/notes');
        await page.getByRole('button', { name: 'Edit' }).click();
        await page.getByPlaceholder('Note title').fill('Final title');
        await page.getByRole('button', { name: 'Save changes' }).click();

        await expect(page.getByRole('status')).toContainText('Note updated');
        await expect(
            page.getByRole('heading', { name: 'Final title' }),
        ).toBeVisible();
    });

    test('deletes a note after confirmation', async ({ authedPage: page }) => {
        await createNoteViaApi(page.context(), {
            title: 'Doomed note',
            content: 'Soon to be gone',
        });

        await page.goto('/notes');
        await page.getByRole('button', { name: 'Delete' }).first().click();

        const dialog = page.getByRole('alertdialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByRole('status')).toContainText('Note deleted');
        await expect(page.getByText('No notes yet')).toBeVisible();
    });

    test('paginates beyond the first page', async ({ authedPage: page }) => {
        for (let i = 1; i <= 13; i++) {
            await createNoteViaApi(page.context(), {
                title: `Bulk note ${i}`,
                content: `Body ${i}`,
            });
        }

        await page.goto('/notes');
        await expect(page.getByText('13 notes')).toBeVisible();
        await expect(page.getByText('Page 1 of 2')).toBeVisible();

        await page.getByRole('link', { name: 'Next page' }).click();
        await expect(page.getByText('Page 2 of 2')).toBeVisible();
        // Newest-first ordering: the oldest note lands on page 2.
        await expect(
            page.getByRole('heading', { name: 'Bulk note 1', exact: true }),
        ).toBeVisible();
    });

    test('requires authentication', async ({ page }) => {
        await page.goto('/notes');
        await expect(page).toHaveURL(/\/login/);
    });
});
