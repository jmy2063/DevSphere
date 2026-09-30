package com.example.shop.inventory;

import jakarta.persistence.*;

@Entity
@Table(name="stock")
public class StockEntity {
    @Id private Long id;
}
