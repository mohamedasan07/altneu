import { request } from './api';

export async function fetchCategories() {
  return request('/api/public/categories');
}
