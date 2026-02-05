describe('Example Test Suite', () => {
  it('should pass a basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have truthy values', () => {
    const value = true;
    expect(value).toBeTruthy();
  });
});
