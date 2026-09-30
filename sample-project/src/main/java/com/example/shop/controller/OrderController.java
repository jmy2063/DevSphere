package com.example.shop.controller;

import com.example.shop.service.OrderService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/orders")
public class OrderController {
    private final OrderService orderService;
    public OrderController(OrderService orderService){ this.orderService = orderService; }

    @PostMapping
    public Object createOrder(){ return orderService.createOrder(); }

    @DeleteMapping("/{id}")
    public void deleteOrder(@PathVariable Long id){ orderService.deleteOrder(id); }
}
