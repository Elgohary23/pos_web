import { SupplierRepository } from '../repositories/supplierRepository.js'

export const SupplierService = {
  list() {
    return SupplierRepository.list()
  },

  getOrCreate(name) {
    return SupplierRepository.getOrCreate(name)
  },
}