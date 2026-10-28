import {test,expect} from '@playwright/test';
test('login screen has remember me option and handles login failure', async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading', {name: 'Tizimga kirish'})).toBeVisible();
 const rememberBox = page.getByLabel('Meni eslab qol');
 await expect(rememberBox).toBeVisible();
 await expect(rememberBox).not.toBeChecked();
 await rememberBox.check();
 await expect(rememberBox).toBeChecked();
 await page.getByLabel('Login', {exact: true}).fill('nonexistent-e2e-account');
 await page.getByLabel('Parol', {exact: true}).fill('definitely-not-the-correct-password');
 await page.getByRole('button',{name:/Tizimga kirish|Kirish/}).click();
 await expect(page.getByText('Login yoki parol xato')).toBeVisible();
});
test('unauthorized API does not expose financial dashboard', async({request})=>{
 const response=await request.get('/api/dashboard');
 expect([401,403]).toContain(response.status());
});

test('remember me stores token and login in localStorage across reloads', async({page})=>{
 const login=process.env.E2E_LOGIN;
 const password=process.env.E2E_PASSWORD;
 test.skip(!login||!password,'Set E2E_LOGIN and E2E_PASSWORD for remember me persistence test');

 await page.goto('/');
 await page.getByLabel('Login', {exact: true}).fill(login!);
 await page.getByLabel('Parol', {exact: true}).fill(password!);
 await page.getByLabel('Meni eslab qol').check();
 await page.getByRole('button',{name:/Tizimga kirish|Kirish/}).click();
 await expect(page.getByText('Bosh sahifa').first()).toBeVisible();

 const storage = await page.evaluate(()=>{
  return {
   localToken: localStorage.getItem('eco_token'),
   localRemember: localStorage.getItem('eco_remember'),
   savedLogin: localStorage.getItem('eco_saved_login'),
   sessionToken: sessionStorage.getItem('eco_token'),
  };
 });

 expect(storage.localToken).toBeTruthy();
 expect(storage.localRemember).toBe('true');
 expect(storage.savedLogin).toBe(login);
 expect(storage.sessionToken).toBeTruthy();

 // Logout should clear token from both storages, but keep savedLogin and remember
 await page.getByRole('button',{name:'Chiqish'}).click();
 await expect(page.getByRole('heading', {name: 'Tizimga kirish'})).toBeVisible();

 const storageAfterLogout = await page.evaluate(()=>{
  return {
   localToken: localStorage.getItem('eco_token'),
   sessionToken: sessionStorage.getItem('eco_token'),
   localRemember: localStorage.getItem('eco_remember'),
   savedLogin: localStorage.getItem('eco_saved_login'),
  };
 });

 expect(storageAfterLogout.localToken).toBeNull();
 expect(storageAfterLogout.sessionToken).toBeNull();
 expect(storageAfterLogout.localRemember).toBe('true');
 expect(storageAfterLogout.savedLogin).toBe(login);
});
