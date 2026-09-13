SELECT c.Name, l.Amount
FROM Customers c
JOIN Loans l ON c.Id = l.CustomerId
WHERE l.Status = 'Active';
