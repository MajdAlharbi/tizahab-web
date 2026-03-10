from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import DailyPlan
from services.recommendation_service import recommend_events
from datetime import datetime

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_daily_plan(request):
    # 1. Get date from request
    date_str = request.data.get('date')
    if not date_str:
        return Response({"detail": "Date is required."}, status=status.HTTP_400_BAD_REQUEST)
    
    plan_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    user = request.user

    # 2. Get user preferences (Mocked for now until we link UserPreference model)
    # TODO: Fetch real user categories from DB
    user_categories = ['food', 'culture', 'outdoor'] 

    # 3. Get recommendations from our AI service
    recommended_events = recommend_events(user_categories, max_events=4)

    if not recommended_events:
        return Response({"detail": "No events found."}, status=status.HTTP_404_NOT_FOUND)

    # 4. Create or update the daily plan
    DailyPlan.objects.filter(user=user, date=plan_date).delete()
    new_plan = DailyPlan.objects.create(user=user, date=plan_date)
    new_plan.events.set(recommended_events)

    # 5. Prepare data for the frontend (Map and List)
    events_data = []
    for event in recommended_events:
        events_data.append({
            "id": event.id,
            "title": event.title,
            "location": event.location,
            "lat": event.latitude,
            "lng": event.longitude,
            "category": event.category,
            "price_range": event.price_range
        })

    return Response({
        "plan_id": new_plan.id,
        "date": date_str,
        "events": events_data
    }, status=status.HTTP_201_CREATED)