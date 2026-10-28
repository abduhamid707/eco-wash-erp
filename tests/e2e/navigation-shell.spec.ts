import {test,expect} from '@playwright/test';
const login=process.env.E2E_LOGIN;
const password=process.env.E2E_PASSWORD;
test.describe('ECO WASH responsive shell',()=>{
 test.skip(!login||!password,'E2E_LOGIN and E2E_PASSWORD required');
 test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByLabel('Login').fill(login!);
  await page.getByLabel('Parol').fill(password!);
  await page.getByRole('button',{name:'Tizimga kirish'}).click();
  await expect(page.locator('.eco-header')).toBeVisible();
 });
 test('desktop navigation and breadcrumbs',async({page,isMobile})=>{
  test.skip(isMobile,'Desktop only');
  await expect(page.getByRole('navigation',{name:'Asosiy navigatsiya'})).toBeVisible();
  await expect(page.locator('.eco-header-location strong')).toContainText('Bosh sahifa');
  await page.getByRole('button',{name:'Ombor va ishlab chiqarish'}).click();
  await expect(page.getByRole('button',{name:'Mahsulot va xomashyo'})).toBeVisible();
  await page.getByRole('button',{name:'Mahsulot va xomashyo'}).click();
  await expect(page.locator('.eco-header-location strong')).toContainText('Ma’lumotnomalar');
  await page.getByRole('button',{name:'Menyuni yig‘ish'}).click();
  await expect(page.locator('.eco-shell')).toHaveClass(/sidebar-collapsed/);
  await page.getByRole('button',{name:'Menyuni kengaytirish'}).click();
  await expect(page.locator('.eco-shell')).not.toHaveClass(/sidebar-collapsed/);
 });
 test('mobile drawer can open and close without page overflow',async({page,isMobile})=>{
  test.skip(!isMobile,'Mobile only');
  await page.getByRole('button',{name:'Menyuni ochish'}).click();
  await expect(page.locator('.eco-sidebar')).toHaveClass(/mobile-open/);
  await page.getByRole('button',{name:'Bosh sahifa'}).click();
  await expect(page.locator('.eco-sidebar')).not.toHaveClass(/mobile-open/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  expect(overflow).toBe(false);
 });
});
