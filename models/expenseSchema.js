import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Users, Receipt, 
  ChevronRight, IndianRupee, QrCode 
} from 'lucide-react';
import '../styles/group.css';

const GroupDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // --- MOCK DATA ---
  const [group] = useState({
    _id: "group_123",
    name: "Goa Trip 2026",
    type: "TRIP",
    myBalance: -500 // Negative means I owe money
  });

  const [expenses] = useState([
    { 
      _id: "exp_1", description: "Dinner at Thalassa", amount: 4500, 
      date: "2026-01-20", paidBy: { name: "Rahul" }, isSettlement: false 
    },
    { 
      _id: "exp_2", description: "Scooty Rental", amount: 800, 
      date: "2026-01-21", paidBy: { name: "You" }, isSettlement: false 
    },
    { 
      _id: "exp_3", description: "Rahul paid You", amount: 200, 
      date: "2026-01-22", paidBy: { name: "Rahul" }, isSettlement: true 
    },
  ]);

  return (
    <div className="group-container">
      
      {/* 1. HEADER */}
      <div className="group-header">
        <button className="icon-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        <div className="header-info">
          <h2>{group.name}</h2>
          <span className="badge">{group.type}</span>
        </div>
        <button className="icon-btn">
          {/* Placeholder for settings or specific group menu */}
          <ChevronRight size={24} style={{opacity: 0}} /> 
        </button>
      </div>

      {/* 2. SUMMARY & NAVIGATION ACTIONS */}
      <section className="summary-section">
        <div className={`summary-card ${group.myBalance >= 0 ? 'green-card' : 'red-card'}`}>
          <div className="balance-info">
            <span className="label">Your Position</span>
            <div className="balance-amount">
              {group.myBalance >= 0 ? "You are owed" : "You owe"}
              <span className="amount">₹{Math.abs(group.myBalance)}</span>
            </div>
          </div>
          
          {/* THE SETTLE BUTTON (Redirects to Settle Page) */}
          <button 
            className="settle-action-btn"
            onClick={() => navigate(`/group/${id}/settle`)}
          >
            Settle Up <ChevronRight size={16} />
          </button>
        </div>

        {/* THE MEMBERS BUTTON (Redirects to Members List) */}
        <button 
          className="members-btn"
          onClick={() => navigate(`/group/${id}/members`)}
        >
          <div className="btn-content">
            <div className="icon-bg"><Users size={20} /></div>
            <span>View Members</span>
          </div>
          <ChevronRight size={18} color="#94a3b8" />
        </button>
      </section>

      {/* 3. EXPENSES FEED (Main Content) */}
      <section className="expenses-feed">
        <div className="feed-header">
          <h3>Expenses</h3>
          <button className="scan-btn">
            <QrCode size={16} /> Scan
          </button>
        </div>

        <div className="feed-list">
          {expenses.map(expense => (
            <div key={expense._id} className="expense-item">
              <div className="expense-left">
                {/* Date Box */}
                <div className={`date-box ${expense.isSettlement ? 'settle-date' : ''}`}>
                   <span className="day">{new Date(expense.date).getDate()}</span>
                   <span className="month">{new Date(expense.date).toLocaleString('default', { month: 'short' })}</span>
                </div>
                
                {/* Text Details */}
                <div className="expense-details">
                  <h4>{expense.description}</h4>
                  <span className="paid-by">
                    {expense.isSettlement ? 
                      `${expense.paidBy.name} paid` : 
                      `${expense.paidBy.name} paid ₹${expense.amount}`
                    }
                  </span>
                </div>
              </div>
              
              {/* Amount */}
              <div className="expense-right">
                <span className={`amount-tag ${expense.isSettlement ? 'green' : 'neutral'}`}>
                  {expense.isSettlement ? 'Settlement' : `₹${expense.amount}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. FLOATING ACTION BUTTON (Add Expense) */}
      <div className="fab-container">
        <button className="fab-btn">
          <Plus size={28} />
          <span>Add Expense</span>
        </button>
      </div>

    </div>
  );
};

export default GroupDetails;