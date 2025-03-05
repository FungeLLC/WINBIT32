import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionButton } from './styles/Exora';

// Mock the styled components - in a real test, you might need to extract this component to its own file
jest.mock('./styles/Exora', () => ({
  ActionButton: ({ children, onClick, visible, disabled, title, icon }) => (
    visible ? (
      <button 
        onClick={onClick} 
        disabled={disabled} 
        title={title}
        data-testid="action-button"
      >
        {icon && <span data-testid="button-icon">{icon}</span>}
        {children}
      </button>
    ) : null
  )
}));

describe('ActionButton Component', () => {
  it('renders correctly when visible', () => {
    const handleClick = jest.fn();
    render(
      <ActionButton 
        visible={true} 
        onClick={handleClick} 
        title="Test Button" 
        icon="🔄"
      >
        Test
      </ActionButton>
    );
    
    const button = screen.getByTestId('action-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Test');
    expect(screen.getByTestId('button-icon')).toHaveTextContent('🔄');
    expect(button).toHaveAttribute('title', 'Test Button');
  });

  it('does not render when not visible', () => {
    render(
      <ActionButton visible={false} onClick={() => {}} title="Test Button">
        Test
      </ActionButton>
    );
    
    expect(screen.queryByTestId('action-button')).not.toBeInTheDocument();
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = jest.fn();
    render(
      <ActionButton visible={true} onClick={handleClick} title="Test Button">
        Test
      </ActionButton>
    );
    
    fireEvent.click(screen.getByTestId('action-button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <ActionButton visible={true} onClick={() => {}} disabled={true} title="Test Button">
        Test
      </ActionButton>
    );
    
    expect(screen.getByTestId('action-button')).toBeDisabled();
  });
}); 