import bcrypt from 'bcryptjs'

export function isDefaultPassword(passwordHash) {
  return bcrypt.compareSync('admin', passwordHash)
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    shiftStart: user.shift_start,
    shiftEnd: user.shift_end,
    createdAt: user.created_at,
    isDefaultPassword: isDefaultPassword(user.password_hash),
  }
}

export function publicCategory(category) {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parent_id ?? null,
    createdAt: category.created_at,
    updatedAt: category.updated_at,
  }
}

export function publicProduct(product) {
  return {
    id: product.id,
    name: product.name,
    wholesalePrice: product.wholesale_price,
    retailPrice: product.retail_price,
    costPrice: product.cost_price,
    barcode: product.barcode,
    imageUrl: product.image_url,
    categoryId: product.category_id,
    categoryName: product.category_name,
    quantity: product.quantity,
    isService: Boolean(product.is_service),
    isActive: Boolean(product.is_active),
    createdAt: product.created_at,
    updatedAt: product.updated_at,
  }
}