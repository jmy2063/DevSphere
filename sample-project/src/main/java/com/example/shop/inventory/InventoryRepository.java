package com.example.shop.inventory;

import org.springframework.stereotype.Repository;

@Repository
public interface InventoryRepository {
    StockEntity reserveStock();
}
