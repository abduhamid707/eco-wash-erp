import {test,expect} from '@playwright/test';
test('login screen and error handling', async({page})=>{
 await page.goto('/');
 await expect(page.getByText('Tizimga kirish')).toBeVisible();
 await page.getByLabel('Login').fill('nonexistent-e2e-account');
 await page.getByLabel('Parol').fill('definitely-not-the-correct-password');
 await page.getByRole('button',{name:'Kirish'}).click();
 await expect(page.getByText('Login yoki parol xato')).toBeVisible();
});
test('unauthorized API does not expose financial dashboard', async({request})=>{
 const response=await request.get('/api/dashboard');
 expect([401,403]).toContain(response.status());
});
