# Contributing to Tizahab

Thank you for your interest in contributing to Tizahab! This document provides guidelines and instructions for contributing.

---

## Getting Started

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/your-username/tizahab-web.git
cd tizahab-web

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run migrations
python manage.py migrate

# Start development server
python manage.py runserver
```

---

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b bugfix/issue-description
```

### 2. Make Changes

- Write clean, readable code
- Add docstrings to functions and classes
- Add type hints where applicable
- Follow PEP 8 style guide

### 3. Test Your Changes

```bash
# Run tests
python manage.py test

# Run with coverage
pytest --cov

# Run specific test
python manage.py test accounts.tests.LoginTestCase
```

### 4. Format Code

```bash
# Format with black
black accounts events daily_plan core

# Sort imports
isort accounts events daily_plan core

# Check with flake8
flake8 accounts events daily_plan core
```

### 5. Commit Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

**Commit Message Format:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Code style (formatting)
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build process, dependencies

**Example:**
```
feat(events): add price filtering to event API

- Add price_min and price_max query parameters
- Validate price ranges
- Add tests for filtering

Closes #123
```

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

---

## Code Style Guide

### Python Style
- Follow PEP 8
- Use 4 spaces for indentation
- Max line length: 88 characters (black default)
- Use type hints: `def get_events(user_id: int) -> List[Event]:`

### Django Models
```python
class Event(models.Model):
    """Represents a tourism event in Riyadh."""
    
    title = models.CharField(
        max_length=255,
        db_index=True,
        help_text="Event title"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Events'
    
    def __str__(self) -> str:
        return self.title
```

### Django Views
```python
class EventListAPIView(ListAPIView):
    """
    List events with optional filtering.
    
    Query Parameters:
        - category: Filter by event category
        - date: Filter by event date
    """
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = Event.objects.all()
        
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)
        
        return queryset
```

### Naming Conventions
- Classes: `PascalCase` (e.g., `UserPreferences`)
- Functions/Methods: `snake_case` (e.g., `get_events()`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `API_TIMEOUT`)
- Private: Prefix with `_` (e.g., `_internal_method()`)

---

## Testing Guidelines

### Write Tests For:
- New features
- Bug fixes
- Edge cases
- Error scenarios

### Test Structure
```python
from django.test import TestCase
from accounts.models import UserPreferences

class UserPreferencesTestCase(TestCase):
    """Tests for UserPreferences model."""
    
    def setUp(self):
        """Set up test data."""
        self.user = User.objects.create_user(
            email='test@example.com',
            password='TestPass123!'
        )
    
    def test_create_preferences(self):
        """Test creating user preferences."""
        prefs = UserPreferences.objects.create(
            user=self.user,
            preferred_language='ar'
        )
        self.assertEqual(prefs.preferred_language, 'ar')
    
    def test_invalid_budget(self):
        """Test budget validation."""
        with self.assertRaises(ValidationError):
            prefs = UserPreferences(
                user=self.user,
                budget_min=500,
                budget_max=100  # Invalid: min > max
            )
            prefs.full_clean()
```

### Run Tests
```bash
# All tests
python manage.py test

# With coverage
pytest --cov=accounts --cov=events --cov=daily_plan --cov=core

# Run specific app
python manage.py test accounts

# Run with verbose output
python manage.py test --verbosity=2
```

---

## Documentation

### Docstring Format (Google Style)
```python
def generate_daily_plan(user: User, date: str) -> List[Event]:
    """
    Generate personalized daily plan for user.
    
    Fetches events matching user preferences and budget constraints,
    then returns sorted recommendations for the specified date.
    
    Args:
        user: Authenticated user object
        date: ISO format date string (YYYY-MM-DD)
    
    Returns:
        List of Event objects matching user preferences
    
    Raises:
        ValueError: If date format is invalid
        UserPreferences.DoesNotExist: If user has no preferences set
    
    Example:
        >>> user = User.objects.get(id=1)
        >>> events = generate_daily_plan(user, '2026-03-15')
        >>> len(events)
        5
    """
```

### Update Documentation
- Update [README.md](README.md) for feature descriptions
- Update [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for API changes
- Add docstrings to new functions/classes
- Update inline comments for complex logic

---

## Reporting Issues

### Report Bugs
[Create an Issue](https://github.com/your-repo/issues/new) with:
- Clear title describing the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Environment (OS, Python version, etc.)

**Example:**
```
Title: Daily plan generation fails with budget 0

Steps to reproduce:
1. Create user with budget_min=0
2. Call /api/daily-plan/generate/
3. Observe error

Expected: Return empty list or error message
Actual: 500 Internal Server Error

Environment: Python 3.10, Django 4.2, PostgreSQL 15
```

### Suggest Features
[Create an Issue](https://github.com/your-repo/issues/new) with:
- Feature description
- Use cases
- Proposed implementation (if you have ideas)
- Examples or mockups

---

## Code Review Process

### Before Submitting PR
- [ ] Code follows style guidelines
- [ ] Tests added for new features
- [ ] Tests pass locally
- [ ] Coverage report looks good
- [ ] Documentation updated
- [ ] No breaking changes (or documented)

### During Review
- Respond to comments promptly
- Ask clarifying questions if needed
- Make requested changes in new commits
- Re-request review after changes

### After Approval
- Maintainers will merge when ready
- Delete feature branch after merge

---

## Performance Considerations

### Database Queries
- Use `select_related()` for ForeignKey
- Use `prefetch_related()` for ManyToManyField and reverse relations
- Avoid N+1 queries
- Add database indexes for frequently queried fields

```python
# ❌ Bad: N+1 queries
events = Event.objects.all()
for event in events:
    print(event.category.name)  # N queries

# ✅ Good: Single query with join
events = Event.objects.select_related('category')
for event in events:
    print(event.category.name)  # 1 query
```

### Caching
- Cache expensive operations
- Use Redis for distributed caching
- Set appropriate TTLs

```python
from django.core.cache import cache

# Cache for 5 minutes
TIMEOUT = 300

cached_data = cache.get('events_food')
if not cached_data:
    cached_data = Event.objects.filter(category='food')
    cache.set('events_food', cached_data, TIMEOUT)
```

---

## Security Checklist

- [ ] No credentials in code or logs
- [ ] Input validation on all user data
- [ ] SQL injection prevention (use ORM)
- [ ] CSRF protection enabled
- [ ] XSS prevention (template escaping)
- [ ] Authentication required for protected endpoints
- [ ] Rate limiting applied

---

## Resources

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Python PEP 8](https://www.python.org/dev/peps/pep-0008/)
- [Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)

---

## Questions?

- Check existing [Issues](https://github.com/your-repo/issues)
- Join our [Discussions](https://github.com/your-repo/discussions)
- Email: support@tizahab.com

---

**Thank you for contributing! 🙏**
