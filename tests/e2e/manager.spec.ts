import {test,expect} from '@playwright/test';
const login=process.env.E2E_LOGIN;
const password=process.env.E2E_PASSWORD;
test.describe('authorized user journeys',()=>{
 test.skip(!login||!password,'Set E2E_LOGIN and E2E_PASSWORD for authenticated tests');
 test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByLabel('Login', {exact: true}).fill(login!);
  await page.getByLabel('Parol', {exact: true}).fill(password!);
  await page.getByRole('button',{name:/Tizimga kirish|Kirish/}).click();
  await expect(page.getByText('Bosh sahifa').first()).toBeVisible();
 });
 test('dashboard can navigate without lost session',async({page})=>{
  await page.getByRole('button',{name:/Ombor va ishlab chiqarish/}).click();
  await page.getByRole('button',{name:'Mahsulotlar va xomashyo'}).click();
  await expect(page.getByText('Ma’lumotnomalar',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Bosh sahifa'}).click();
  await expect(page.getByText('Ombor qoldig‘i')).toBeVisible();
 });
 test('operation form enforces product selection',async({page})=>{
  await page.getByRole('button',{name:/Ombor va ishlab chiqarish/}).click();
  await page.getByRole('button',{name:'Kirim va chiqim'}).click();
  await expect(page.getByText('Operatsiyani kiritish')).toBeVisible();
  await expect(page.getByRole('button',{name:'Serverga saqlash'})).toBeVisible();
 });
 test('offline nav opens safely',async({page})=>{
  await page.getByRole('button',{name:/Offline navbat/}).click();
  await expect(page.getByText('Internetga ulanishni kutayotgan amallar')).toBeVisible();
 });
});
