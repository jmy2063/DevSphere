package com.example.shop.inventory;

import org.springframework.stereotype.Service;

@Service
public class InventoryService {
    private final InventoryRepository inventoryRepository;
    public InventoryService(InventoryRepository inventoryRepository) { this.inventoryRepository = inventoryRepository; }
    public void reserve() { inventoryRepository.reserveStock(); }
}
