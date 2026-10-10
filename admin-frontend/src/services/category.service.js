import api from './api'

export async function listCategories() {
  const response = await api.get('/admin/categories')
  return response.data
}

export async function createCategory(payload) {
  const response = await api.post('/admin/categories', payload)
  return response.data.category
}

export async function updateCategory(id, payload) {
  const response = await api.put(`/admin/categories/${id}`, payload)
  return response.data.category
}

export async function deleteCategory(id) {
  const response = await api.delete(`/admin/categories/${id}`)
  return response.data
}
